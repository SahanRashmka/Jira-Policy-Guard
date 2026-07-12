# Data model

## Principles

The canonical model is versioned, tenant-local, ID-based, validated at every boundary, and independent of Forge. Forge hosted storage already partitions data by app installation, environment, site, and Atlassian product; cross-site reads are not possible ([Custom Entity Store](https://developer.atlassian.com/platform/forge/storage-reference/entities/)). This is a **confirmed capability**, not a substitute for project-level authorization inside an installation.

Persist timestamps as UTC ISO-8601 strings and IDs as opaque strings. Store Jira field, project, issue-type, transition, user, and group IDs; optional names are display snapshots and must never drive evaluation.

## Canonical domain types

```ts
type Scope = { type: 'GLOBAL' } | { type: 'PROJECT'; projectId: string };

type Severity = 'ERROR' | 'WARNING';

interface PolicyBase {
  id: string;
  schemaVersion: 1;
  name: string;
  description?: string;
  scope: Scope;
  enabled: boolean;
  conditions: Condition[];
  transitionIds: string[];
  issueTypeIds: string[];
  failureMessage: string;
  severity: Severity;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
  deletedAt?: string;
  deletedBy?: string;
}

type Policy =
  | (PolicyBase & { ruleType: 'REQUIRED_FIELD'; requirement: RequiredField })
  | (PolicyBase & { ruleType: 'TEXT_PATTERN'; requirement: TextPattern })
  | (PolicyBase & { ruleType: 'ALLOWED_VALUES'; requirement: AllowedValues })
  | (PolicyBase & { ruleType: 'NUMERIC_COMPARISON'; requirement: NumericComparison })
  | (PolicyBase & { ruleType: 'LINKED_ISSUE'; requirement: LinkedIssue })
  | (PolicyBase & { ruleType: 'USER_GROUP'; requirement: UserGroup });

interface FieldReference {
  fieldId: string;
  displayName?: string;
  kind: 'SYSTEM' | 'CUSTOM';
}

interface Condition {
  field: FieldReference;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'IS_EMPTY' | 'IS_NOT_EMPTY';
  value?: unknown;
}

interface RequiredField {
  type: 'REQUIRED_FIELD';
  field: FieldReference;
}

interface TextPattern {
  type: 'TEXT_PATTERN';
  field: FieldReference;
  pattern: string;
  flags: string;
}

interface AllowedValues {
  type: 'ALLOWED_VALUES';
  field: FieldReference;
  values: Array<string | number>;
}

interface NumericComparison {
  type: 'NUMERIC_COMPARISON';
  field: FieldReference;
  operator: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ';
  value: number;
}

interface LinkedIssue {
  type: 'LINKED_ISSUE';
  linkTypeId?: string;
  linkedIssueTypeIds?: string[];
  direction: 'INWARD' | 'OUTWARD' | 'EITHER';
  minimum: number;
}

interface UserGroup {
  type: 'USER_GROUP';
  field: FieldReference;
  groupId: string;
}
```

A conditional requirement is not a separate requirement type: it is any policy whose `conditions` must match before its typed requirement is evaluated. Transition restriction is likewise represented by `transitionIds`; an empty list means all transitions. This removes overlapping rule types from the original sketch.

The persisted form may encode `scopeType` and `projectId` separately for indexing, but repository mapping must reconstruct the safe `Scope` union and reject `PROJECT` without a `projectId` or `GLOBAL` with one.

## Evaluation model

```ts
interface IssueSnapshot {
  issueId: string;
  issueKey: string;
  projectId: string;
  issueTypeId: string;
  transitionId?: string;
  fields: Readonly<Record<string, unknown>>;
  links?: ReadonlyArray<IssueLinkSnapshot>;
}

interface PolicyEvaluationResult {
  valid: boolean;
  violations: PolicyViolation[];
  evaluatedPolicyIds: string[];
}

interface PolicyViolation {
  policyId: string;
  policyName: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
  fieldId?: string;
  code: string;
}
```

The evaluator takes validated policies plus an immutable snapshot and returns no side effects. `valid` is false only when at least one `ERROR` violation exists. Violations are deterministically ordered by policy ID then violation code. Audit logging occurs outside the engine.

## Audit model

```ts
type AuditEventType =
  | 'POLICY_CREATED'
  | 'POLICY_UPDATED'
  | 'POLICY_DELETED'
  | 'POLICY_ENABLED'
  | 'POLICY_DISABLED'
  | 'POLICY_EVALUATION_FAILED'
  | 'POLICY_IMPORTED';

interface AuditRecord {
  id: string;
  schemaVersion: 1;
  eventType: AuditEventType;
  policyId?: string;
  projectId?: string;
  issueId?: string;
  actorAccountId?: string;
  occurredAt: string;
  metadata: Record<string, string | number | boolean | null>;
}
```

Metadata must be allow-listed per event. Do not store full issue snapshots, field values, imported documents, email addresses, group membership lists, or stack traces. Account IDs are stored only where accountability requires them.

## Storage design

Use the current `@forge/kvs` Custom Entity API, which requires `storage:app`. Custom entities and indexes are declared under `app.storage.entities` in `manifest.yml` ([schema reference](https://developer.atlassian.com/platform/forge/storage-reference/entities-manifest/)). Exact attribute/index limits must be rechecked during Phase 1.

### `policy` entity

| Attribute              | Type       | Purpose                                                                         |
| ---------------------- | ---------- | ------------------------------------------------------------------------------- |
| key                    | entity key | Policy UUID                                                                     |
| schemaVersion, version | integer    | Migration and optimistic concurrency                                            |
| scopeType, projectId   | string     | Applicability and indexed lookup; global uses sentinel `GLOBAL` partition value |
| enabled, deleted       | boolean    | Filtering                                                                       |
| ruleType               | string     | Filtering/admin UI                                                              |
| name, updatedAt        | string     | Listing/sort display                                                            |
| document               | any        | Validated canonical policy document                                             |

Proposed access patterns:

- enabled global policies by `scopeType + enabled`;
- enabled project policies by `projectId + enabled`;
- paginated administration list by scope and updated time;
- direct get by entity key.

Custom Entity indexes must match those access patterns; do not add speculative indexes. If boolean compound indexes are unsupported or inefficient in the current manifest schema, use normalized string partition keys such as `GLOBAL#ENABLED` and `PROJECT:<id>#ENABLED` (**PoC required**).

### `audit` entity

| Attribute                         | Type       | Purpose                     |
| --------------------------------- | ---------- | --------------------------- |
| key                               | entity key | Time-sortable audit ID      |
| schemaVersion                     | integer    | Migration                   |
| scopePartition                    | string     | `GLOBAL` or `PROJECT:<id>`  |
| policyId, issueId, actorAccountId | string     | Optional references         |
| eventType, occurredAt             | string     | Filter/sort                 |
| metadata                          | any        | Bounded allow-listed detail |

Indexes support cursor-paginated queries by scope/time and policy/time. Issue ID is not initially indexed. Audit retention and deletion must run in bounded batches.

### KVS singleton keys

- `meta:schema-version`
- `meta:migration-lock` only if the selected migration method needs it
- `settings:feature-limits`
- `settings:audit-retention`

No policy list is stored as one growing array.

## Consistency and concurrency

- Every update includes the last-read `version`; mismatch returns a conflict and does not overwrite.
- Increment `version` and write the audit event in one Custom Entity transaction where supported.
- Custom Entity transactions are **confirmed**, but limited to 25 operations and 4 MB ([reference](https://developer.atlassian.com/platform/forge/storage-reference/entities-transactions/)). Bulk import therefore validates the complete file first, then writes bounded batches and reports partial failure; all-or-nothing large import is not assumed.
- Delete is initially a tombstone (`deletedAt`, `deletedBy`) so audit references remain meaningful. Hard deletion follows the retention policy.
- Evaluation reads may race with an update. The accepted semantics are a consistent-enough latest read per queried page; no global snapshot isolation is assumed.

## Schema migration

1. Parse persisted `schemaVersion` with the schema for that version.
2. Apply pure, sequential migrations (`v1 -> v2`) in memory.
3. Validate the resulting current document.
4. Write back lazily with an optimistic version check, or migrate in bounded admin-triggered batches.
5. Never silently discard an unknown future version.

Export format is an envelope, not a raw entity dump:

```json
{
  "format": "jira-policy-guard/policies",
  "exportVersion": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "policies": []
}
```

Imports reject unknown keys where practical, malformed discriminators, excessive counts/sizes, duplicate IDs or semantic duplicates, unsafe regex, and project IDs outside the authorized target. Imported records receive new local IDs unless an explicit update mode with version checks is later designed.

## Limits to define before implementation

The product must set bounded defaults for policies per installation/project, conditions per policy, string lengths, import bytes/count, regex length, list page size, audit metadata size, and retention days. Forge publishes installation-level operation, key, object, transaction, and entity limits ([current limits](https://developer.atlassian.com/platform/forge/limits-kvs-ce/)); application limits should remain comfortably below them.

## Assumptions and PoCs

- **Assumption:** policy payloads fit safely in a Custom Entity `any` attribute after application limits.
- **PoC required:** verify the exact indexes with Forge CLI 13.1.0 and deploy/query them on a development installation.
- **PoC required:** establish field-value normalization for Jira REST responses and workflow `modifiedFields`, especially rich text, select, user, numeric, and linked-issue values.
- **Deferred:** policy history snapshots, cross-site identifiers, external database, analytics warehouse, and cross-site synchronization.
