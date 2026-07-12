import type {
  Condition,
  IssueSnapshot,
  Policy,
  PolicyEvaluationResult,
  PolicyViolation,
} from '../policy/policy.js';
import { parseIssueSnapshot, parsePolicy } from '../policy/schema.js';

function isMissing(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
  return actual === expected;
}

function conditionMatches(condition: Condition, issue: IssueSnapshot): boolean {
  const actual = issue.fields[condition.field.fieldId];

  switch (condition.operator) {
    case 'EQUALS':
      return valuesEqual(actual, condition.value);
    case 'NOT_EQUALS':
      return !valuesEqual(actual, condition.value);
    case 'IN':
      return (
        Array.isArray(condition.value) &&
        condition.value.some((value) => valuesEqual(actual, value))
      );
    case 'NOT_IN':
      return (
        Array.isArray(condition.value) &&
        !condition.value.some((value) => valuesEqual(actual, value))
      );
    case 'IS_EMPTY':
      return isMissing(actual);
    case 'IS_NOT_EMPTY':
      return !isMissing(actual);
  }
}

function isApplicable(policy: Policy, issue: IssueSnapshot): boolean {
  if (!policy.enabled) return false;
  if (policy.scope.type === 'PROJECT' && policy.scope.projectId !== issue.projectId) return false;
  if (policy.issueTypeIds.length > 0 && !policy.issueTypeIds.includes(issue.issueTypeId))
    return false;
  if (
    policy.transitionIds.length > 0 &&
    (issue.transitionId === undefined || !policy.transitionIds.includes(issue.transitionId))
  ) {
    return false;
  }
  return policy.conditions.every((condition) => conditionMatches(condition, issue));
}

function evaluateRequiredField(policy: Policy, issue: IssueSnapshot): PolicyViolation | undefined {
  const fieldId = policy.requirement.field.fieldId;
  if (!isMissing(issue.fields[fieldId])) return undefined;

  return {
    policyId: policy.id,
    policyName: policy.name,
    message: policy.failureMessage,
    severity: policy.severity,
    fieldId,
    code: 'REQUIRED_FIELD_MISSING',
  };
}

export function evaluatePolicies(
  policyInputs: readonly unknown[],
  issueInput: unknown,
): PolicyEvaluationResult {
  const issue = parseIssueSnapshot(issueInput);
  const policies = policyInputs
    .map((input) => parsePolicy(input))
    .sort((left, right) => left.id.localeCompare(right.id));
  const applicablePolicies = policies.filter((policy) => isApplicable(policy, issue));
  const violations = applicablePolicies
    .map((policy) => evaluateRequiredField(policy, issue))
    .filter((violation): violation is PolicyViolation => violation !== undefined);

  return {
    valid: !violations.some((violation) => violation.severity === 'ERROR'),
    violations,
    evaluatedPolicyIds: applicablePolicies.map((policy) => policy.id),
  };
}
