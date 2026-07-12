import { makeResolver } from '@forge/resolver';
import { randomUUID } from 'node:crypto';

import { createPolicyAdminHandlers } from '../../application/policy-admin/handlers.js';
import type { PolicyResolverDefinitions } from '../../application/policy-admin/contracts.js';
import { JiraProjectAuthorization } from '../../infrastructure/auth/jira-project-authorization.js';
import { ForgePolicyRepository } from '../../infrastructure/forge-storage/forge-policy-repository.js';

const handlers = createPolicyAdminHandlers({
  repository: new ForgePolicyRepository(),
  authorization: new JiraProjectAuthorization(),
  now: () => new Date(),
  createId: randomUUID,
});

export const handler = makeResolver<PolicyResolverDefinitions>({
  createPolicy: (request) => handlers.createPolicy(request),
  listPolicies: (request) => handlers.listPolicies(request),
});
