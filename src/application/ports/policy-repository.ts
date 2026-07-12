import type { Policy } from '../../domain/index.js';

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

export interface Page<T> {
  readonly values: readonly T[];
  readonly nextCursor?: string;
}

export type PolicyScopeFilter =
  { readonly type: 'GLOBAL' } | { readonly type: 'PROJECT'; readonly projectId: string };

export interface PolicyListFilter {
  readonly scope: PolicyScopeFilter;
  readonly enabled?: boolean;
}

export interface PolicyRepository {
  getById(id: string): Promise<Policy | undefined>;
  list(filter: PolicyListFilter, page: PageRequest): Promise<Page<Policy>>;
  create(policy: Policy): Promise<void>;
  update(policy: Policy, expectedVersion: number): Promise<void>;
  delete(id: string, expectedVersion: number): Promise<void>;
}
