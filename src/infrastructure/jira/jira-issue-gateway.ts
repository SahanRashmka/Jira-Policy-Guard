import api, { route, type Response as ForgeResponse } from '@forge/api';
import { z } from 'zod';

import type {
  IssueMetadata,
  JiraIssueGateway,
} from '../../application/workflow-validation/contracts.js';

const issueMetadataSchema = z.looseObject({
  id: z.string().trim().min(1),
  key: z.string().trim().min(1),
  fields: z.looseObject({
    project: z.looseObject({ id: z.string().trim().min(1) }),
    issuetype: z.looseObject({ id: z.string().trim().min(1) }),
  }),
});

const issueFieldsSchema = z.looseObject({
  fields: z.record(z.string(), z.unknown()),
});

async function responseJson(response: ForgeResponse): Promise<unknown> {
  if (!response.ok) throw new Error('Jira issue data is unavailable.');
  return response.json();
}

export class ForgeJiraIssueGateway implements JiraIssueGateway {
  async getIssueMetadata(issueKey: string): Promise<IssueMetadata> {
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueKey}?fields=project,issuetype`);
    const issue = issueMetadataSchema.parse(await responseJson(response));
    return {
      issueId: issue.id,
      issueKey: issue.key,
      projectId: issue.fields.project.id,
      issueTypeId: issue.fields.issuetype.id,
    };
  }

  async getIssueFields(
    issueKey: string,
    fieldIds: readonly string[],
  ): Promise<Readonly<Record<string, unknown>>> {
    if (fieldIds.length === 0) return {};
    const fields = fieldIds.join(',');
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueKey}?fields=${fields}`);
    return issueFieldsSchema.parse(await responseJson(response)).fields;
  }
}
