export interface WorkflowValidationInput {
  readonly issueKey: string;
  readonly destinationStatusId: string;
  readonly modifiedFields: Readonly<Record<string, unknown>>;
}

export interface WorkflowValidationResult {
  readonly result: boolean;
  readonly errorMessage?: string;
}

export interface IssueMetadata {
  readonly issueId: string;
  readonly issueKey: string;
  readonly projectId: string;
  readonly issueTypeId: string;
}

export interface JiraIssueGateway {
  getIssueMetadata(issueKey: string): Promise<IssueMetadata>;
  getIssueFields(
    issueKey: string,
    fieldIds: readonly string[],
  ): Promise<Readonly<Record<string, unknown>>>;
}
