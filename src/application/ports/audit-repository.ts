export type AuditEventType =
  | 'POLICY_CREATED'
  | 'POLICY_UPDATED'
  | 'POLICY_DELETED'
  | 'POLICY_ENABLED'
  | 'POLICY_DISABLED'
  | 'POLICY_EVALUATION_FAILED';

export type AuditMetadataValue = string | number | boolean | null;

export interface AuditRecord {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly eventType: AuditEventType;
  readonly policyId?: string;
  readonly projectId?: string;
  readonly issueId?: string;
  readonly actorAccountId?: string;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
}

export interface AuditRepository {
  append(record: AuditRecord): Promise<void>;
}
