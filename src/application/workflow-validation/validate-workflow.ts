import type { AuditRepository } from '../ports/audit-repository.js';
import type { PolicyRepository } from '../ports/policy-repository.js';
import { evaluatePolicies, type Policy, type PolicyViolation } from '../../domain/index.js';
import type {
  JiraIssueGateway,
  WorkflowValidationInput,
  WorkflowValidationResult,
} from './contracts.js';

const TECHNICAL_ERROR_MESSAGE =
  'Jira Policy Guard could not validate this transition. Try again or contact your Jira administrator.';
const MAX_POLICIES_PER_PROJECT = 100;
const MAX_MESSAGES = 3;

export interface WorkflowValidationDependencies {
  readonly policyRepository: PolicyRepository;
  readonly auditRepository: AuditRepository;
  readonly issueGateway: JiraIssueGateway;
  readonly now: () => Date;
  readonly createId: () => string;
  readonly logTechnicalError: (message: string) => void;
}

function requiredFieldIds(policies: readonly Policy[]): string[] {
  return [
    ...new Set(
      policies.flatMap((policy) => [
        policy.requirement.field.fieldId,
        ...policy.conditions.map((condition) => condition.field.fieldId),
      ]),
    ),
  ].sort();
}

function userMessage(violations: readonly PolicyViolation[]): string {
  const messages = [...new Set(violations.map((violation) => violation.message))];
  const visible = messages.slice(0, MAX_MESSAGES);
  const remaining = messages.length - visible.length;
  return [
    'Jira Policy Guard blocked this transition:',
    ...visible.map((message) => `• ${message}`),
    ...(remaining > 0 ? [`• ${String(remaining)} additional violation(s).`] : []),
  ].join('\n');
}

async function recordViolations(
  dependencies: WorkflowValidationDependencies,
  input: WorkflowValidationInput,
  issueId: string,
  projectId: string,
  violations: readonly PolicyViolation[],
): Promise<void> {
  const occurredAt = dependencies.now().toISOString();
  const results = await Promise.allSettled(
    violations.map((violation) =>
      dependencies.auditRepository.append({
        id: dependencies.createId(),
        schemaVersion: 1,
        eventType: 'POLICY_EVALUATION_FAILED',
        policyId: violation.policyId,
        projectId,
        issueId,
        occurredAt,
        metadata: {
          code: violation.code,
          severity: violation.severity,
          destinationStatusId: input.destinationStatusId,
        },
      }),
    ),
  );
  if (results.some((result) => result.status === 'rejected')) {
    dependencies.logTechnicalError('Failed to persist one or more policy violation audits.');
  }
}

export function createWorkflowValidator(dependencies: WorkflowValidationDependencies) {
  return async (input: WorkflowValidationInput): Promise<WorkflowValidationResult> => {
    try {
      const metadata = await dependencies.issueGateway.getIssueMetadata(input.issueKey);
      const page = await dependencies.policyRepository.list(
        { scope: { type: 'PROJECT', projectId: metadata.projectId }, enabled: true },
        { limit: MAX_POLICIES_PER_PROJECT },
      );
      const fields = await dependencies.issueGateway.getIssueFields(
        input.issueKey,
        requiredFieldIds(page.values),
      );
      const evaluation = evaluatePolicies(page.values, {
        issueId: metadata.issueId,
        issueKey: metadata.issueKey,
        projectId: metadata.projectId,
        issueTypeId: metadata.issueTypeId,
        transitionId: input.destinationStatusId,
        fields: { ...fields, ...input.modifiedFields },
      });
      const blockingViolations = evaluation.violations.filter(
        (violation) => violation.severity === 'ERROR',
      );
      if (blockingViolations.length === 0) return { result: true };

      await recordViolations(
        dependencies,
        input,
        metadata.issueId,
        metadata.projectId,
        blockingViolations,
      );
      return { result: false, errorMessage: userMessage(blockingViolations) };
    } catch {
      dependencies.logTechnicalError('Workflow policy validation failed with a technical error.');
      return { result: false, errorMessage: TECHNICAL_ERROR_MESSAGE };
    }
  };
}
