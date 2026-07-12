import { kvs } from '@forge/kvs';

import type { AuditRecord, AuditRepository } from '../../application/ports/audit-repository.js';

export class ForgeAuditRepository implements AuditRepository {
  async append(record: AuditRecord): Promise<void> {
    const key = `audit:project:${record.projectId ?? 'unknown'}:${record.occurredAt}:${record.id}`;
    await kvs.set(key, record, { keyPolicy: 'FAIL_IF_EXISTS' });
  }
}
