import { describe, expect, it } from 'vitest';

import {
  evaluatePolicies,
  parsePolicy,
  type IssueSnapshot,
  type Policy,
} from '../../src/domain/index.js';

const timestamp = '2026-07-12T00:00:00.000Z';

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-1',
    schemaVersion: 1,
    name: 'Root cause is required',
    scope: { type: 'PROJECT', projectId: '10000' },
    enabled: true,
    ruleType: 'REQUIRED_FIELD',
    conditions: [],
    requirement: {
      type: 'REQUIRED_FIELD',
      field: { fieldId: 'customfield_10000', displayName: 'Root Cause', kind: 'CUSTOM' },
    },
    transitionIds: [],
    issueTypeIds: ['10001'],
    failureMessage: 'Root Cause is required.',
    severity: 'ERROR',
    createdAt: timestamp,
    createdBy: 'account-1',
    updatedAt: timestamp,
    updatedBy: 'account-1',
    version: 1,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    issueId: '20000',
    issueKey: 'TEST-1',
    projectId: '10000',
    issueTypeId: '10001',
    fields: {},
    ...overrides,
  };
}

describe('evaluatePolicies', () => {
  it('reports a missing required field for an applicable policy', () => {
    const result = evaluatePolicies([makePolicy()], makeIssue());

    expect(result).toEqual({
      valid: false,
      evaluatedPolicyIds: ['policy-1'],
      violations: [
        {
          policyId: 'policy-1',
          policyName: 'Root cause is required',
          message: 'Root Cause is required.',
          severity: 'ERROR',
          fieldId: 'customfield_10000',
          code: 'REQUIRED_FIELD_MISSING',
        },
      ],
    });
  });

  it.each([undefined, null, '', '   ', []])('treats %j as missing', (value) => {
    const result = evaluatePolicies(
      [makePolicy()],
      makeIssue({ fields: { customfield_10000: value } }),
    );

    expect(result.valid).toBe(false);
  });

  it.each(['documented', 0, false, ['value']])('accepts valid field value %j', (value) => {
    const result = evaluatePolicies(
      [makePolicy()],
      makeIssue({ fields: { customfield_10000: value } }),
    );

    expect(result).toEqual({ valid: true, evaluatedPolicyIds: ['policy-1'], violations: [] });
  });

  it('does not evaluate a disabled policy', () => {
    const result = evaluatePolicies([makePolicy({ enabled: false })], makeIssue());

    expect(result).toEqual({ valid: true, evaluatedPolicyIds: [], violations: [] });
  });

  it('filters a policy for a different project', () => {
    const result = evaluatePolicies([makePolicy()], makeIssue({ projectId: 'other-project' }));

    expect(result).toEqual({ valid: true, evaluatedPolicyIds: [], violations: [] });
  });

  it('applies a global policy to any project', () => {
    const result = evaluatePolicies(
      [makePolicy({ scope: { type: 'GLOBAL' } })],
      makeIssue({ projectId: 'other-project' }),
    );

    expect(result.valid).toBe(false);
    expect(result.evaluatedPolicyIds).toEqual(['policy-1']);
  });

  it('filters a policy for a different issue type', () => {
    const result = evaluatePolicies([makePolicy()], makeIssue({ issueTypeId: 'other-type' }));

    expect(result).toEqual({ valid: true, evaluatedPolicyIds: [], violations: [] });
  });

  it('applies a policy with no issue-type restriction', () => {
    const result = evaluatePolicies(
      [makePolicy({ issueTypeIds: [] })],
      makeIssue({ issueTypeId: 'other-type' }),
    );

    expect(result.valid).toBe(false);
  });

  it('evaluates the requirement only when all conditions match', () => {
    const policy = makePolicy({
      conditions: [
        {
          field: { fieldId: 'priority', kind: 'SYSTEM' },
          operator: 'EQUALS',
          value: 'Highest',
        },
      ],
    });

    expect(evaluatePolicies([policy], makeIssue({ fields: { priority: 'Highest' } })).valid).toBe(
      false,
    );
    expect(evaluatePolicies([policy], makeIssue({ fields: { priority: 'Low' } }))).toEqual({
      valid: true,
      evaluatedPolicyIds: [],
      violations: [],
    });
  });

  it.each([
    ['NOT_EQUALS', 'Low', 'Highest'],
    ['IN', 'Highest', ['Highest', 'High']],
    ['NOT_IN', 'Low', ['Highest', 'High']],
    ['IS_EMPTY', undefined, undefined],
    ['IS_NOT_EMPTY', 'Highest', undefined],
  ] as const)('supports the %s applicability operator', (operator, actual, value) => {
    const normalizedValue: string | string[] | undefined =
      typeof value === 'string' ? value : value === undefined ? undefined : Array.from(value);
    const condition = {
      field: { fieldId: 'priority', kind: 'SYSTEM' as const },
      operator,
      ...(normalizedValue === undefined ? {} : { value: normalizedValue }),
    };
    const policy = makePolicy({ conditions: [condition] });

    expect(evaluatePolicies([policy], makeIssue({ fields: { priority: actual } })).valid).toBe(
      false,
    );
  });

  it('handles array equality in conditions', () => {
    const policy = makePolicy({
      conditions: [
        {
          field: { fieldId: 'labels', kind: 'SYSTEM' },
          operator: 'EQUALS',
          value: ['production'],
        },
      ],
    });

    expect(
      evaluatePolicies([policy], makeIssue({ fields: { labels: ['production'] } })).valid,
    ).toBe(false);
    expect(evaluatePolicies([policy], makeIssue({ fields: { labels: ['staging'] } })).valid).toBe(
      true,
    );
  });

  it('filters by transition when configured', () => {
    const policy = makePolicy({ transitionIds: ['31'] });

    expect(evaluatePolicies([policy], makeIssue()).evaluatedPolicyIds).toEqual([]);
    expect(evaluatePolicies([policy], makeIssue({ transitionId: '31' })).valid).toBe(false);
  });

  it('keeps warnings non-blocking while returning the violation', () => {
    const result = evaluatePolicies([makePolicy({ severity: 'WARNING' })], makeIssue());

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(1);
  });

  it('returns deterministic policy ordering', () => {
    const result = evaluatePolicies(
      [makePolicy({ id: 'policy-b' }), makePolicy({ id: 'policy-a' })],
      makeIssue(),
    );

    expect(result.evaluatedPolicyIds).toEqual(['policy-a', 'policy-b']);
    expect(result.violations.map((violation) => violation.policyId)).toEqual([
      'policy-a',
      'policy-b',
    ]);
  });
});

describe('policy schema', () => {
  it('rejects malformed policies before evaluation', () => {
    const malformed = { ...makePolicy(), schemaVersion: 2 };

    expect(() => parsePolicy(malformed)).toThrow();
    expect(() => evaluatePolicies([malformed], makeIssue())).toThrow();
  });

  it('rejects unsupported rule types and unexpected properties', () => {
    expect(() => parsePolicy({ ...makePolicy(), ruleType: 'TEXT_PATTERN' })).toThrow();
    expect(() => parsePolicy({ ...makePolicy(), unsafe: true })).toThrow();
  });

  it('rejects malformed conditions', () => {
    expect(() =>
      parsePolicy({
        ...makePolicy(),
        conditions: [
          {
            field: { fieldId: 'priority', kind: 'SYSTEM' },
            operator: 'EQUALS',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects values on empty operators and scalar values on set operators', () => {
    const field = { fieldId: 'priority', kind: 'SYSTEM' };

    expect(() =>
      parsePolicy({
        ...makePolicy(),
        conditions: [{ field, operator: 'IS_EMPTY', value: 'unexpected' }],
      }),
    ).toThrow();
    expect(() =>
      parsePolicy({
        ...makePolicy(),
        conditions: [{ field, operator: 'IN', value: 'Highest' }],
      }),
    ).toThrow();
  });

  it('rejects malformed issue snapshots', () => {
    expect(() => evaluatePolicies([makePolicy()], { ...makeIssue(), fields: null })).toThrow();
  });
});
