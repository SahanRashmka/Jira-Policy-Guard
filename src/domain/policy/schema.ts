import { z } from 'zod';

const nonBlankString = z.string().trim().min(1);
const isoDateTime = z.iso.datetime({ offset: true });

export const fieldReferenceSchema = z
  .object({
    fieldId: nonBlankString,
    displayName: nonBlankString.optional(),
    kind: z.enum(['SYSTEM', 'CUSTOM']),
  })
  .strict();

const comparableValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

export const conditionSchema = z
  .object({
    field: fieldReferenceSchema,
    operator: z.enum(['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY']),
    value: comparableValueSchema.optional(),
  })
  .strict()
  .superRefine((condition, context) => {
    const requiresValue = ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN'].includes(condition.operator);
    if (requiresValue && condition.value === undefined) {
      context.addIssue({ code: 'custom', message: `${condition.operator} requires a value` });
    }
    if (!requiresValue && condition.value !== undefined) {
      context.addIssue({
        code: 'custom',
        message: `${condition.operator} does not accept a value`,
      });
    }
    if (
      (condition.operator === 'IN' || condition.operator === 'NOT_IN') &&
      !Array.isArray(condition.value)
    ) {
      context.addIssue({
        code: 'custom',
        message: `${condition.operator} requires an array value`,
      });
    }
  });

export const policyScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GLOBAL') }).strict(),
  z.object({ type: z.literal('PROJECT'), projectId: nonBlankString }).strict(),
]);

const requiredFieldRequirementSchema = z
  .object({
    type: z.literal('REQUIRED_FIELD'),
    field: fieldReferenceSchema,
  })
  .strict();

export const requiredFieldPolicySchema = z
  .object({
    id: nonBlankString,
    schemaVersion: z.literal(1),
    name: nonBlankString.max(200),
    description: z.string().trim().max(2000).optional(),
    scope: policyScopeSchema,
    enabled: z.boolean(),
    ruleType: z.literal('REQUIRED_FIELD'),
    conditions: z.array(conditionSchema).max(20),
    requirement: requiredFieldRequirementSchema,
    transitionIds: z.array(nonBlankString).max(100),
    issueTypeIds: z.array(nonBlankString).max(100),
    failureMessage: nonBlankString.max(500),
    severity: z.enum(['ERROR', 'WARNING']),
    createdAt: isoDateTime,
    createdBy: nonBlankString,
    updatedAt: isoDateTime,
    updatedBy: nonBlankString,
    version: z.number().int().positive(),
  })
  .strict();

export const issueSnapshotSchema = z
  .object({
    issueId: nonBlankString,
    issueKey: nonBlankString,
    projectId: nonBlankString,
    issueTypeId: nonBlankString,
    transitionId: nonBlankString.optional(),
    fields: z.record(z.string(), z.unknown()),
  })
  .strict();

export function parsePolicy(input: unknown) {
  return requiredFieldPolicySchema.parse(input);
}

export function parseIssueSnapshot(input: unknown) {
  return issueSnapshotSchema.parse(input);
}
