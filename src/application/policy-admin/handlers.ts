import { z } from 'zod';

import type { PolicyRepository } from '../ports/policy-repository.js';
import { POLICY_SCHEMA_VERSION, type Policy } from '../../domain/index.js';
import type { ProjectAuthorization } from './authorization.js';
import {
  createPolicyInputSchema,
  listPoliciesInputSchema,
  policyListItemSchema,
  type ListPoliciesResult,
  type PolicyListItem,
} from './contracts.js';

const resolverContextSchema = z.looseObject({
  accountId: z.string().trim().min(1),
  extension: z.looseObject({
    project: z.looseObject({ id: z.string().trim().min(1) }),
  }),
});

export interface ResolverRequest {
  readonly payload: unknown;
  readonly context: unknown;
}

export interface PolicyAdminDependencies {
  readonly repository: PolicyRepository;
  readonly authorization: ProjectAuthorization;
  readonly now: () => Date;
  readonly createId: () => string;
}

function trustedContext(input: unknown): { accountId: string; projectId: string } {
  const context = resolverContextSchema.parse(input);
  return { accountId: context.accountId, projectId: context.extension.project.id };
}

function toListItem(policy: Policy): PolicyListItem {
  return policyListItemSchema.parse({
    id: policy.id,
    name: policy.name,
    ...(policy.description === undefined ? {} : { description: policy.description }),
    enabled: policy.enabled,
    ruleType: policy.ruleType,
    requirement: policy.requirement,
    issueTypeIds: policy.issueTypeIds,
    failureMessage: policy.failureMessage,
    severity: policy.severity,
    updatedAt: policy.updatedAt,
    version: policy.version,
  });
}

export function createPolicyAdminHandlers(dependencies: PolicyAdminDependencies) {
  return {
    async createPolicy(request: ResolverRequest): Promise<PolicyListItem> {
      const input = createPolicyInputSchema.parse(request.payload);
      const context = trustedContext(request.context);
      await dependencies.authorization.assertCanAdministerProject(context.projectId);

      const occurredAt = dependencies.now().toISOString();
      const policy: Policy = {
        id: dependencies.createId(),
        schemaVersion: POLICY_SCHEMA_VERSION,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        scope: { type: 'PROJECT', projectId: context.projectId },
        enabled: true,
        ruleType: 'REQUIRED_FIELD',
        conditions: [],
        requirement: {
          type: 'REQUIRED_FIELD',
          field: {
            fieldId: input.fieldId,
            ...(input.fieldDisplayName === undefined
              ? {}
              : { displayName: input.fieldDisplayName }),
            kind: input.fieldId.startsWith('customfield_') ? 'CUSTOM' : 'SYSTEM',
          },
        },
        transitionIds: [],
        issueTypeIds: input.issueTypeIds,
        failureMessage: input.failureMessage,
        severity: input.severity,
        createdAt: occurredAt,
        createdBy: context.accountId,
        updatedAt: occurredAt,
        updatedBy: context.accountId,
        version: 1,
      };

      await dependencies.repository.create(policy);
      return toListItem(policy);
    },

    async listPolicies(request: ResolverRequest): Promise<ListPoliciesResult> {
      listPoliciesInputSchema.parse(request.payload);
      const context = trustedContext(request.context);
      await dependencies.authorization.assertCanAdministerProject(context.projectId);
      const page = await dependencies.repository.list(
        { scope: { type: 'PROJECT', projectId: context.projectId } },
        { limit: 100 },
      );
      return { policies: page.values.map(toListItem) };
    },
  };
}
