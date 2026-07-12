import api, { route } from '@forge/api';
import { z } from 'zod';

import {
  AuthorizationError,
  type ProjectAuthorization,
} from '../../application/policy-admin/authorization.js';

const permissionsResponseSchema = z.looseObject({
  permissions: z.looseObject({
    ADMINISTER_PROJECTS: z.looseObject({ havePermission: z.boolean() }),
  }),
});

export class JiraProjectAuthorization implements ProjectAuthorization {
  async assertCanAdministerProject(projectId: string): Promise<void> {
    const response = await api
      .asUser()
      .requestJira(
        route`/rest/api/3/mypermissions?projectId=${projectId}&permissions=ADMINISTER_PROJECTS`,
      );

    if (!response.ok) throw new AuthorizationError();
    const permissions = permissionsResponseSchema.safeParse(await response.json());
    if (!permissions.success || !permissions.data.permissions.ADMINISTER_PROJECTS.havePermission) {
      throw new AuthorizationError();
    }
  }
}
