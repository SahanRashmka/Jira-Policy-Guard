import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { createWorkflowValidator } from '../../application/workflow-validation/validate-workflow.js';
import { ForgeAuditRepository } from '../../infrastructure/forge-storage/forge-audit-repository.js';
import { ForgePolicyRepository } from '../../infrastructure/forge-storage/forge-policy-repository.js';
import { ForgeJiraIssueGateway } from '../../infrastructure/jira/jira-issue-gateway.js';

const validatorPayloadSchema = z.looseObject({
  issue: z.looseObject({ key: z.string().trim().min(1) }),
  transition: z.looseObject({
    to: z.looseObject({ id: z.string().trim().min(1) }),
    modifiedFields: z.record(z.string(), z.unknown()).default({}),
  }),
});

const workflowValidator = createWorkflowValidator({
  policyRepository: new ForgePolicyRepository(),
  auditRepository: new ForgeAuditRepository(),
  issueGateway: new ForgeJiraIssueGateway(),
  now: () => new Date(),
  createId: randomUUID,
  logTechnicalError: (message) => console.error(message),
});

export async function validate(payload: unknown) {
  const parsed = validatorPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.error('Workflow validator received an invalid payload.');
    return {
      result: false,
      errorMessage:
        'Jira Policy Guard could not validate this transition. Try again or contact your Jira administrator.',
    };
  }
  return workflowValidator({
    issueKey: parsed.data.issue.key,
    destinationStatusId: parsed.data.transition.to.id,
    modifiedFields: parsed.data.transition.modifiedFields,
  });
}
