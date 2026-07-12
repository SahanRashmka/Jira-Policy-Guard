export interface ProjectAuthorization {
  assertCanAdministerProject(projectId: string): Promise<void>;
}

export class AuthorizationError extends Error {
  constructor() {
    super('You must be a project administrator to manage policies.');
    this.name = 'AuthorizationError';
  }
}
