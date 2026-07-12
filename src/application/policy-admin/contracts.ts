import { z } from 'zod';

import { requiredFieldPolicySchema } from '../../domain/index.js';

const nonBlankString = z.string().trim().min(1);

export const createPolicyInputSchema = z
  .object({
    name: nonBlankString.max(200),
    description: z.string().trim().max(2000).optional(),
    fieldId: nonBlankString.max(255),
    fieldDisplayName: nonBlankString.max(255).optional(),
    issueTypeIds: z.array(nonBlankString).max(100).default([]),
    failureMessage: nonBlankString.max(500),
    severity: z.enum(['ERROR', 'WARNING']).default('ERROR'),
  })
  .strict();

export const listPoliciesInputSchema = z.object({}).strict();

export const policyListItemSchema = requiredFieldPolicySchema.pick({
  id: true,
  name: true,
  description: true,
  enabled: true,
  ruleType: true,
  requirement: true,
  issueTypeIds: true,
  failureMessage: true,
  severity: true,
  updatedAt: true,
  version: true,
});

export type CreatePolicyInput = z.infer<typeof createPolicyInputSchema>;
export type PolicyListItem = z.infer<typeof policyListItemSchema>;

export interface ListPoliciesResult {
  readonly policies: readonly PolicyListItem[];
}

// Forge's Definitions constraint requires a type alias so named resolver keys satisfy its record type.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type PolicyResolverDefinitions = {
  createPolicy: (input: CreatePolicyInput) => PolicyListItem;
  listPolicies: (input: Record<string, never>) => ListPoliciesResult;
};
