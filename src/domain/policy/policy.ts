import type { z } from 'zod';

import type {
  conditionSchema,
  fieldReferenceSchema,
  policyScopeSchema,
  requiredFieldPolicySchema,
} from './schema.js';

export const POLICY_SCHEMA_VERSION = 1 as const;

export type FieldReference = z.infer<typeof fieldReferenceSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type PolicyScope = z.infer<typeof policyScopeSchema>;
export type RequiredFieldPolicy = z.infer<typeof requiredFieldPolicySchema>;
export type Policy = RequiredFieldPolicy;

export interface IssueSnapshot {
  readonly issueId: string;
  readonly issueKey: string;
  readonly projectId: string;
  readonly issueTypeId: string;
  readonly transitionId?: string | undefined;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface PolicyViolation {
  readonly policyId: string;
  readonly policyName: string;
  readonly message: string;
  readonly severity: 'ERROR' | 'WARNING';
  readonly fieldId: string;
  readonly code: 'REQUIRED_FIELD_MISSING';
}

export interface PolicyEvaluationResult {
  readonly valid: boolean;
  readonly violations: readonly PolicyViolation[];
  readonly evaluatedPolicyIds: readonly string[];
}
