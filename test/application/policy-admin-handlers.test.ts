import { describe, expect, it, vi } from 'vitest';

import {
  AuthorizationError,
  type ProjectAuthorization,
} from '../../src/application/policy-admin/authorization.js';
import { createPolicyAdminHandlers } from '../../src/application/policy-admin/handlers.js';
import type {
  Page,
  PageRequest,
  PolicyListFilter,
  PolicyRepository,
} from '../../src/application/ports/policy-repository.js';
import type { Policy } from '../../src/domain/index.js';

class InMemoryPolicyRepository implements PolicyRepository {
  readonly policies: Policy[] = [];

  getById(id: string): Promise<Policy | undefined> {
    return Promise.resolve(this.policies.find((policy) => policy.id === id));
  }

  list(filter: PolicyListFilter, page: PageRequest): Promise<Page<Policy>> {
    return Promise.resolve({
      values: this.policies
        .filter(
          (policy) =>
            policy.scope.type === filter.scope.type &&
            (policy.scope.type === 'GLOBAL' ||
              (filter.scope.type === 'PROJECT' &&
                policy.scope.projectId === filter.scope.projectId)),
        )
        .slice(0, page.limit),
    });
  }

  create(policy: Policy): Promise<void> {
    this.policies.push(policy);
    return Promise.resolve();
  }

  update(): Promise<void> {
    return Promise.reject(new Error('Not implemented in this test repository.'));
  }

  delete(): Promise<void> {
    return Promise.reject(new Error('Not implemented in this test repository.'));
  }
}

function request(payload: unknown, projectId = 'project-100') {
  return {
    payload,
    context: {
      accountId: 'account-100',
      extension: { project: { id: projectId, key: 'TEST' } },
    },
  };
}

function input() {
  return {
    name: 'Root cause required',
    fieldId: 'customfield_10000',
    fieldDisplayName: 'Root Cause',
    issueTypeIds: ['10001'],
    failureMessage: 'Root Cause is required.',
    severity: 'ERROR' as const,
  };
}

function dependencies(repository: PolicyRepository, authorization: ProjectAuthorization) {
  return {
    repository,
    authorization,
    now: () => new Date('2026-07-12T00:00:00.000Z'),
    createId: () => 'policy-100',
  };
}

describe('project policy administration handlers', () => {
  it('creates and subsequently lists a project-scoped required-field policy', async () => {
    const repository = new InMemoryPolicyRepository();
    const authorization = { assertCanAdministerProject: vi.fn().mockResolvedValue(undefined) };
    const handlers = createPolicyAdminHandlers(dependencies(repository, authorization));

    await expect(handlers.createPolicy(request(input()))).resolves.toMatchObject({
      id: 'policy-100',
      ruleType: 'REQUIRED_FIELD',
      name: 'Root cause required',
    });
    await expect(handlers.listPolicies(request({}))).resolves.toMatchObject({
      policies: [{ id: 'policy-100', name: 'Root cause required' }],
    });
    expect(repository.policies[0]?.scope).toEqual({ type: 'PROJECT', projectId: 'project-100' });
    expect(authorization.assertCanAdministerProject).toHaveBeenCalledWith('project-100');
  });

  it('does not expose policies belonging to another project', async () => {
    const repository = new InMemoryPolicyRepository();
    const authorization = { assertCanAdministerProject: vi.fn().mockResolvedValue(undefined) };
    const handlers = createPolicyAdminHandlers(dependencies(repository, authorization));
    await handlers.createPolicy(request(input(), 'project-100'));

    await expect(handlers.listPolicies(request({}, 'project-200'))).resolves.toEqual({
      policies: [],
    });
  });

  it('rejects direct create calls when authorization fails without writing', async () => {
    const repository = new InMemoryPolicyRepository();
    const authorization = {
      assertCanAdministerProject: vi.fn().mockRejectedValue(new AuthorizationError()),
    };
    const handlers = createPolicyAdminHandlers(dependencies(repository, authorization));

    await expect(handlers.createPolicy(request(input()))).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(repository.policies).toHaveLength(0);
  });

  it('rejects malformed client input and client-supplied project identity', async () => {
    const repository = new InMemoryPolicyRepository();
    const authorization = { assertCanAdministerProject: vi.fn().mockResolvedValue(undefined) };
    const handlers = createPolicyAdminHandlers(dependencies(repository, authorization));

    await expect(handlers.createPolicy(request({ ...input(), name: '' }))).rejects.toThrow();
    await expect(
      handlers.createPolicy(request({ ...input(), projectId: 'attacker-project' })),
    ).rejects.toThrow();
    expect(repository.policies).toHaveLength(0);
  });

  it('rejects requests without trusted project context', async () => {
    const repository = new InMemoryPolicyRepository();
    const authorization = { assertCanAdministerProject: vi.fn().mockResolvedValue(undefined) };
    const handlers = createPolicyAdminHandlers(dependencies(repository, authorization));

    await expect(
      handlers.createPolicy({ payload: input(), context: { accountId: 'account-100' } }),
    ).rejects.toThrow();
    expect(authorization.assertCanAdministerProject).not.toHaveBeenCalled();
  });
});
