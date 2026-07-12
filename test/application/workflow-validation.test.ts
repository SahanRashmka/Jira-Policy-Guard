import { describe, expect, it, vi } from 'vitest';

import type { AuditRecord, AuditRepository } from '../../src/application/ports/audit-repository.js';
import type {
  Page,
  PageRequest,
  PolicyListFilter,
  PolicyRepository,
} from '../../src/application/ports/policy-repository.js';
import type {
  IssueMetadata,
  JiraIssueGateway,
} from '../../src/application/workflow-validation/contracts.js';
import { createWorkflowValidator } from '../../src/application/workflow-validation/validate-workflow.js';
import type { Policy } from '../../src/domain/index.js';

const timestamp = '2026-07-12T00:00:00.000Z';

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-1',
    schemaVersion: 1,
    name: 'Root Cause required',
    scope: { type: 'PROJECT', projectId: 'project-1' },
    enabled: true,
    ruleType: 'REQUIRED_FIELD',
    conditions: [],
    requirement: {
      type: 'REQUIRED_FIELD',
      field: { fieldId: 'customfield_10000', displayName: 'Root Cause', kind: 'CUSTOM' },
    },
    transitionIds: ['done-status'],
    issueTypeIds: ['bug-type'],
    failureMessage: 'Root Cause is required before Done.',
    severity: 'ERROR',
    createdAt: timestamp,
    createdBy: 'account-1',
    updatedAt: timestamp,
    updatedBy: 'account-1',
    version: 1,
    ...overrides,
  };
}

class TestPolicyRepository implements PolicyRepository {
  constructor(private readonly policies: readonly Policy[]) {}

  getById(id: string): Promise<Policy | undefined> {
    return Promise.resolve(this.policies.find((item) => item.id === id));
  }

  list(filter: PolicyListFilter, _page: PageRequest): Promise<Page<Policy>> {
    return Promise.resolve({
      values: this.policies.filter(
        (item) =>
          item.scope.type === 'PROJECT' &&
          filter.scope.type === 'PROJECT' &&
          item.scope.projectId === filter.scope.projectId &&
          (filter.enabled === undefined || item.enabled === filter.enabled),
      ),
    });
  }

  create(): Promise<void> {
    return Promise.reject(new Error('Not used.'));
  }

  update(): Promise<void> {
    return Promise.reject(new Error('Not used.'));
  }

  delete(): Promise<void> {
    return Promise.reject(new Error('Not used.'));
  }
}

class TestAuditRepository implements AuditRepository {
  readonly records: AuditRecord[] = [];

  append(record: AuditRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

class TestIssueGateway implements JiraIssueGateway {
  readonly requestedFields: string[][] = [];

  constructor(
    private readonly metadata: IssueMetadata = {
      issueId: 'issue-1',
      issueKey: 'TEST-1',
      projectId: 'project-1',
      issueTypeId: 'bug-type',
    },
    private readonly fields: Readonly<Record<string, unknown>> = {},
  ) {}

  getIssueMetadata(): Promise<IssueMetadata> {
    return Promise.resolve(this.metadata);
  }

  getIssueFields(
    _issueKey: string,
    fieldIds: readonly string[],
  ): Promise<Readonly<Record<string, unknown>>> {
    this.requestedFields.push([...fieldIds]);
    return Promise.resolve(this.fields);
  }
}

function validator(
  policies: readonly Policy[],
  issueGateway = new TestIssueGateway(),
  auditRepository = new TestAuditRepository(),
) {
  const logTechnicalError = vi.fn();
  return {
    auditRepository,
    issueGateway,
    logTechnicalError,
    validate: createWorkflowValidator({
      policyRepository: new TestPolicyRepository(policies),
      auditRepository,
      issueGateway,
      now: () => new Date(timestamp),
      createId: () => 'audit-1',
      logTechnicalError,
    }),
  };
}

const input = {
  issueKey: 'TEST-1',
  destinationStatusId: 'done-status',
  modifiedFields: {},
};

describe('workflow policy validation', () => {
  it('blocks an applicable transition and writes an audit when the field is missing', async () => {
    const context = validator([policy()]);

    await expect(context.validate(input)).resolves.toEqual({
      result: false,
      errorMessage:
        'Jira Policy Guard blocked this transition:\n• Root Cause is required before Done.',
    });
    expect(context.issueGateway.requestedFields).toEqual([['customfield_10000']]);
    expect(context.auditRepository.records).toEqual([
      expect.objectContaining({
        eventType: 'POLICY_EVALUATION_FAILED',
        policyId: 'policy-1',
        projectId: 'project-1',
        issueId: 'issue-1',
      }),
    ]);
  });

  it('allows the transition when the persisted field is populated', async () => {
    const context = validator(
      [policy()],
      new TestIssueGateway(undefined, { customfield_10000: 'Documented cause' }),
    );

    await expect(context.validate(input)).resolves.toEqual({ result: true });
    expect(context.auditRepository.records).toHaveLength(0);
  });

  it('uses transition-screen modified fields over the persisted issue value', async () => {
    const context = validator(
      [policy()],
      new TestIssueGateway(undefined, { customfield_10000: '' }),
    );

    await expect(
      context.validate({ ...input, modifiedFields: { customfield_10000: 'Entered on screen' } }),
    ).resolves.toEqual({ result: true });
  });

  it('ignores disabled and irrelevant policies', async () => {
    const context = validator([
      policy({ id: 'disabled', enabled: false }),
      policy({ id: 'other-type', issueTypeIds: ['story-type'] }),
      policy({ id: 'other-transition', transitionIds: ['in-progress-status'] }),
    ]);

    await expect(context.validate(input)).resolves.toEqual({ result: true });
    expect(context.auditRepository.records).toHaveLength(0);
  });

  it('fails closed with a generic message and no sensitive error details', async () => {
    const gateway = new TestIssueGateway();
    vi.spyOn(gateway, 'getIssueMetadata').mockRejectedValue(
      new Error('secret stack and custom field content'),
    );
    const context = validator([policy()], gateway);

    const result = await context.validate(input);

    expect(result.result).toBe(false);
    expect(result.errorMessage).toContain('could not validate this transition');
    expect(result.errorMessage).not.toContain('secret');
    expect(context.logTechnicalError).toHaveBeenCalledWith(
      'Workflow policy validation failed with a technical error.',
    );
  });

  it('still blocks when audit persistence fails', async () => {
    const auditRepository: AuditRepository = {
      append: () => Promise.reject(new Error('storage detail')),
    };
    const context = validator(
      [policy()],
      new TestIssueGateway(),
      auditRepository as TestAuditRepository,
    );

    await expect(context.validate(input)).resolves.toMatchObject({ result: false });
    expect(context.logTechnicalError).toHaveBeenCalledWith(
      'Failed to persist one or more policy violation audits.',
    );
  });
});
