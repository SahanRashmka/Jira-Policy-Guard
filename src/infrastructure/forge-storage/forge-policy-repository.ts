import { kvs, WhereConditions, type ListResult } from '@forge/kvs';

import type {
  Page,
  PageRequest,
  PolicyListFilter,
  PolicyRepository,
} from '../../application/ports/policy-repository.js';
import { parsePolicy, type Policy } from '../../domain/index.js';

const POLICY_KEY_PREFIX = 'policy:';

function projectPrefix(projectId: string): string {
  return `${POLICY_KEY_PREFIX}project:${projectId}:`;
}

function policyKey(policy: Policy): string {
  if (policy.scope.type !== 'PROJECT') {
    return `${POLICY_KEY_PREFIX}global:${policy.id}`;
  }
  return `${projectPrefix(policy.scope.projectId)}${policy.id}`;
}

export class ForgePolicyRepository implements PolicyRepository {
  async getById(id: string): Promise<Policy | undefined> {
    const matches = await kvs
      .query()
      .where('key', WhereConditions.beginsWith(POLICY_KEY_PREFIX))
      .limit(100)
      .getMany<unknown>();
    const match = matches.results
      .map((result) => parsePolicy(result.value))
      .find((p) => p.id === id);
    return match;
  }

  async list(filter: PolicyListFilter, page: PageRequest): Promise<Page<Policy>> {
    const prefix =
      filter.scope.type === 'PROJECT'
        ? projectPrefix(filter.scope.projectId)
        : `${POLICY_KEY_PREFIX}global:`;
    let query = kvs
      .query()
      .where('key', WhereConditions.beginsWith(prefix))
      .limit(Math.min(Math.max(page.limit, 1), 100));
    if (page.cursor !== undefined) query = query.cursor(page.cursor);
    const result: ListResult<unknown> = await query.getMany<unknown>();
    const values = result.results
      .map((item) => parsePolicy(item.value))
      .filter((policy) => filter.enabled === undefined || policy.enabled === filter.enabled);
    return {
      values,
      ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
    };
  }

  async create(policy: Policy): Promise<void> {
    await kvs.set(policyKey(policy), parsePolicy(policy), { keyPolicy: 'FAIL_IF_EXISTS' });
  }

  update(policy: Policy, expectedVersion: number): Promise<void> {
    return Promise.reject(
      new Error(`Policy update is not implemented: ${policy.id}@${String(expectedVersion)}`),
    );
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return Promise.reject(
      new Error(`Policy deletion is not implemented: ${id}@${String(expectedVersion)}`),
    );
  }
}
