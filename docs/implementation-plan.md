# Implementation plan

## Planning constraints

No feature or scaffold is implemented yet. The repository has no package manifest, Forge manifest, source code, or project dependency baseline. Each phase below ends in a deployable, reviewable state; later phases do not redefine earlier contracts without a migration.

## Gate 0 — platform proofs

Complete these small proofs before the production scaffold hardens around uncertain behavior:

1. Upgrade local development to Node 24 to match the currently recommended `nodejs24.x` Forge runtime; confirm Forge CLI compatibility.
2. Create/register a disposable Forge app and validate the exact manifest keys for `jira:projectSettingsPage`, `jira:adminPage`, `jira:issueContext`, `jira:workflowValidator`, functions, resources, scopes, and custom entities.
3. Deploy a function-based workflow validator to company-managed and team-managed test projects. Verify old/new workflow editors, transition-screen `modifiedFields`, error strings, installation/attachment steps, invocation latency, and configuration payload.
4. Prove indexed policy queries, cursor pagination, optimistic conditional update, and policy+audit transaction with `@forge/kvs`.
5. Prove secure project/global permission checks using resolver invocation context and Jira REST.
6. Normalize representative Jira field shapes from REST and validator payloads.

Decision output: retain/adjust the module map, select supported project types, freeze the initial storage indexes, and document manual workflow setup. Workflow validators are currently Preview, so failure of this gate changes MVP enforcement architecture rather than being hidden as implementation detail.

## Phase 1 — foundation and required-field administration

### Deliverables

- Forge TypeScript scaffold and registered app ID.
- Strict TypeScript, ESLint, Prettier, Vitest, coverage, and CI scripts.
- Root lockfile committed; remove `package-lock.json` from `.gitignore`.
- Domain schemas and pure evaluator for required-field policies.
- Application ports/use cases: create and list first; update/delete interfaces can be defined only when exercised.
- Custom Entity policy repository, migration metadata, and optimistic concurrency.
- Project-settings Custom UI with accessible create/list flows.
- Resolver input/output schemas and project-admin authorization.
- Feature-limit abstractions with a development FREE implementation.
- Unit tests and focused storage/authorization integration tests.
- Setup, security, testing, and manual-test documentation required by the spec.

### Acceptance gate

Run and record: clean install, format check, lint, typecheck, unit/integration tests, UI build, `forge lint`, development deploy, installation, and manual create/reload test as a project admin. Also verify a non-admin cannot invoke mutation resolvers directly.

No workflow enforcement is claimed in Phase 1.

## Phase 2 — enforcement and visibility

### Deliverables

- Function workflow validator backed by the same application evaluator.
- Project, issue-type, and transition applicability.
- Deterministic aggregation and bounded blocking message.
- Issue context showing applicable policies and current violations.
- Append-only policy-change and evaluation-failure audits with retention limits.
- Documented workflow attachment/setup for administrators.
- Failure-mode tests: storage/API error, missing fields, removed fields, app access rules, time/rate limits.

### Acceptance gate

Manual tests across supported project/workflow types, transition screens, bulk/automation transitions where applicable, disabled policies, multiple violations, stale field references, and issue-context permission boundaries. Measure p95 validator duration in a representative test corpus and set a conservative policy-count limit.

## Phase 3 — rule expansion

Implement one registry strategy at a time:

1. Conditional required field.
2. Allowed values.
3. Numeric comparison.
4. Text pattern after regex-safety PoC.
5. Linked issue requirement after payload/API normalization PoC.
6. User/group requirement only if permission, privacy, latency, and group-ID behavior are acceptable.

Every rule adds a discriminated schema, editor form, normalization tests, evaluator tests, import/export fixture, and manual transition test. Do not treat unknown Jira field types as strings by default.

## Phase 4 — administration

- Site-admin `jira:adminPage` and global policy resolution.
- Precedence/duplicate rules for global plus project policies.
- Clone, import/export, and dry-run issue testing.
- Cursor-paginated audit viewer; audit export only for entitled plan.
- Version history if retention and storage costs are approved.
- Configurable `LicenseService`/`FeatureLimitService`; continue to state that Marketplace licensing is not implemented.

Global scope means one Jira site installation. Cross-site or Atlassian-organization policy distribution stays deferred.

## Phase 5 — Marketplace readiness

- Replace the development license adapter with the supported Marketplace licensing integration.
- Privacy policy, data inventory, retention/deletion controls, support and incident processes.
- Accessibility audit, threat model, dependency/SBOM scanning, penetration testing as appropriate.
- Upgrade, rollback, migration, uninstall/reinstall, and disaster-recovery tests.
- Performance/cost budgets under Forge’s consumption model and current limits.
- Marketplace content/assets and end-user/admin documentation.
- Telemetry only after explicit privacy, consent, egress, and disclosure design.

## Test strategy

| Level                | Focus                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Domain unit          | All operators, applicability, deterministic multiple violations, malformed data, missing fields, regex behavior |
| Application unit     | Authorization/limit ordering, conflicts, import semantics, audit intent                                         |
| Adapter contract     | Jira payload normalization, storage mapping, pagination/cursors, transaction conflicts                          |
| UI component         | Accessible forms, loading/empty/error states, confirmation, resolver DTO handling                               |
| Deployed integration | Manifest/module rendering, Jira permissions, workflows, REST scopes, Forge storage behavior                     |
| Manual/regression    | Real Jira transitions, project types/editors, field types, app upgrades and failures                            |

Tests must not mock away the contract being tested. A deployed Forge development environment is required for claims about manifest validity, module placement, Jira workflow behavior, and hosted storage.

## Initial work breakdown

Suggested first reviewable changes after authorization to implement:

1. Scaffold from the current Forge template and commit tooling only.
2. Add domain schemas/evaluator plus tests, with no Forge imports.
3. Add application ports/use cases and in-memory test doubles.
4. Add Custom Entity manifest/schema and repository contract tests.
5. Add authorization adapter and resolver boundary.
6. Add project-settings UI create/list flow.
7. Deploy, manually verify, and close documentation gaps.

## Decisions required from product/security

- Supported project types and workflow editors for MVP.
- Fail-open versus fail-closed behavior on technical evaluation errors.
- Global/project precedence and duplicate policy semantics.
- Audit retention, deletion, and who may view/export it.
- Whether `WARNING` is informational only.
- Maximum active policies and whether the proposed FREE limits apply before licensing exists.
- Allowed regex syntax and acceptable safeguards.
- Data residency/Marketplace targets and whether app-access-rule compatibility is required at launch.
