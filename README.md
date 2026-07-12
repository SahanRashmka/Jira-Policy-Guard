# Jira Policy Guard

Enforce Jira data-quality and workflow policies without writing code.

Jira Policy Guard is an Atlassian Forge app for defining project-level policies and validating Jira workflow transitions. The current implementation is an early MVP focused on `REQUIRED_FIELD` policies in company-managed Jira projects.

## Current capabilities

- Project settings Custom UI for creating and listing policies.
- Project-scoped `REQUIRED_FIELD` policies.
- Server-side input validation with Zod.
- Project-administrator authorization on every administration resolver call.
- Forge KVS persistence, isolated by app installation and project.
- Forge workflow validator for company-managed workflows.
- Project, issue-type, enabled-state, and destination-status applicability filtering.
- Transition-screen `modifiedFields` merged over persisted Jira field values.
- Clear transition-blocking messages for `ERROR` violations.
- Append-only audit records for blocking policy violations.
- Pure Forge-independent policy evaluator with unit tests.

The app does not modify Jira issues. Workflow enforcement runs only on transitions where an administrator has manually attached the Jira Policy Guard validator.

## Project status

Implemented:

- Phase 1 domain/tooling foundation.
- First project-administration create/list flow.
- Required-field workflow enforcement.

Not yet implemented:

- Policy update, deletion, cloning, enable/disable controls, or global administration.
- Issue-context violation display.
- Conditional, regex, allowed-value, numeric, linked-issue, or user/group rules.
- Import/export, dry-run testing, audit viewer/export, or policy version history.
- Marketplace licensing or billing.
- Team-managed project support.

See [implementation-plan.md](docs/implementation-plan.md) and [known-limitations.md](docs/known-limitations.md) for the phased roadmap and platform constraints.

## Architecture

The code follows four layers:

- `src/domain` — versioned policy types, schemas, and the pure evaluator.
- `src/application` — repository ports and administration/enforcement orchestration.
- `src/infrastructure` — Jira API, Forge KVS, audit, and authorization adapters.
- `src/presentation` — Forge resolver and workflow-validator entry points.
- `static/policy-guard-ui` — React Custom UI project-settings interface.

The dependency direction is presentation → application → domain. The domain evaluator imports no Forge APIs.

More detail is available in [architecture.md](docs/architecture.md) and [data-model.md](docs/data-model.md).

## Prerequisites

- Node.js 22.12 or later. Forge currently runs this app with `nodejs22.x`.
- npm.
- Forge CLI 13.x or a compatible current version.
- An Atlassian developer account with access to the registered Forge app.
- A Jira Cloud development site.
- Jira administrator access for deployment/installation and workflow configuration.

Authenticate the CLI before deploying:

```bash
forge login
forge whoami
```

The repository is registered as the Forge app `Jira Policy Guard`. Do not replace `app.id` in `manifest.yml` unless intentionally registering a separate app.

## Installation and local setup

Install the exact locked dependencies:

```bash
npm ci
```

Build and validate locally:

```bash
npm run build
npm test
npm run lint
forge lint
```

Deploy to the Forge development environment:

```bash
forge deploy --environment development
```

Install the app on a Jira development site:

```bash
forge install --environment development
```

Follow the CLI prompts to select Jira and the target site. If a manifest scope changes after installation, run:

```bash
forge install --upgrade --environment development
```

Deployment and installation affect an Atlassian site and should be performed deliberately in a development environment first.

## Jira configuration

### Create a policy

1. Open a company-managed Jira project.
2. Open **Project settings**.
3. Under **Apps**, select **Jira Policy Guard**.
4. Enter a policy name, Jira field ID, optional display name, and failure message.
5. Create the policy.

The authoritative project ID is obtained from secure Forge resolver context. A browser-provided project ID is neither accepted nor trusted. The server independently checks `ADMINISTER_PROJECTS` before creating or listing policies.

The current UI expects a Jira field ID such as `description`, `assignee`, or `customfield_10000`. It does not yet provide a field picker.

### Attach the workflow validator

Creating a policy does not automatically modify Jira workflows.

1. Open Jira workflow administration for the company-managed project.
2. Edit the applicable workflow and transition.
3. Add the **Jira Policy Guard** validator.
4. Publish the workflow changes.

The validator checks all enabled policies applicable to the issue project, issue type, and destination status. In the current model, `transitionIds` contain destination status IDs because Forge's documented lambda payload provides `transition.to.id`, not a transition ID.

## Enforcement behavior

During a configured transition, the validator:

1. Loads the issue project and issue type.
2. Loads up to 100 enabled policies for that project.
3. Requests only fields referenced by those policies where practical.
4. Overlays values changed on the transition screen.
5. Runs the pure policy evaluator.
6. Blocks when one or more `ERROR` violations exist.
7. Records a `POLICY_EVALUATION_FAILED` audit event for each blocking violation.

`WARNING` violations do not block transitions.

Unexpected storage, Jira API, payload, or evaluation errors fail closed: the transition is blocked with a generic retry/contact-administrator message. User-facing errors do not include stack traces, field values, or internal exception details. Audit-write failure is logged generically and does not allow an otherwise invalid transition.

## Permissions

The manifest currently requests:

| Scope            | Purpose                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `storage:app`    | Persist policies and audit records in Forge-hosted storage.                                                        |
| `read:jira-work` | Check project permissions, retrieve issue metadata and referenced fields, and receive transition `modifiedFields`. |

The app requests no Jira write scope, external egress, offline impersonation, or user/group modification scope. See [permissions.md](docs/permissions.md) for the authorization model and scope rationale.

## Development commands

| Command                 | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm run build`         | Build Custom UI and run strict TypeScript checking.                    |
| `npm run build:ui`      | Build the Vite Custom UI bundle.                                       |
| `npm test`              | Run all Vitest tests once.                                             |
| `npm run test:coverage` | Run tests with V8 coverage thresholds.                                 |
| `npm run lint`          | Run ESLint across source and tests.                                    |
| `npm run typecheck`     | Run TypeScript without emitting files.                                 |
| `npm run format`        | Apply Prettier formatting.                                             |
| `npm run format:check`  | Verify formatting without modifying files.                             |
| `forge lint`            | Validate the registered Forge manifest and known platform constraints. |

Generated UI assets under `static/policy-guard-ui/dist` and coverage reports under `coverage` are intentionally ignored.

## Testing

The automated suite covers:

- Applicable and non-applicable required-field policies.
- Missing, blank, empty-array, populated, falsy numeric, and Boolean values.
- Project, issue-type, destination-status, condition, and enabled-state filtering.
- Transition-screen values overriding persisted issue values.
- Deterministic multiple-policy evaluation.
- Malformed policy, condition, and issue input.
- Project-admin authorization and direct unauthorized resolver calls.
- Project isolation for administration listing.
- Blocking and successful workflow validation.
- Violation audit creation and audit-write failure behavior.
- Generic fail-closed handling for technical errors.

Automated tests do not replace a deployed Jira smoke test. Before release, verify policy creation, persistence after reload, workflow attachment, transition blocking, successful transitions, and audit persistence on a Jira development site.

## Environment handling

Forge provides separate `development`, `staging`, and `production` environments. Their hosted storage is isolated, so policies created in one environment are not visible in another.

- Use `development` for active implementation and manual testing.
- Promote a reviewed build to `staging` for release testing.
- Deploy to `production` only after upgrade, permission, and manual workflow tests pass.
- Never store secrets in source or Custom UI. Use encrypted Forge environment variables if a future feature requires secrets.

No application-specific environment variables are currently required.

## Known limitations

- Forge workflow validators remain a Preview capability.
- Only company-managed projects are declared in the manifest.
- Validators must be attached manually to each relevant transition.
- Only `REQUIRED_FIELD` is supported.
- The administration UI creates policies without conditions, issue-type restrictions, or destination-status restrictions; these model capabilities currently require future UI work.
- Policy listing is bounded to 100 records.
- Audit records are persisted but have no viewer, export, or retention cleanup yet.
- Global policies and cross-site synchronization are not implemented.
- Technical validation failures deliberately block transitions.

See [known-limitations.md](docs/known-limitations.md) for the complete risk register.

## Roadmap

1. Complete policy lifecycle controls and issue-context visibility.
2. Add conditional, allowed-value, numeric, text-pattern, and linked-issue strategies incrementally.
3. Add global administration, cloning, import/export, dry-run testing, and feature limits.
4. Add audit retention/viewing and policy migrations/version history.
5. Complete Marketplace licensing, privacy, accessibility, upgrade, and production-hardening work.

## Documentation

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Permissions and authorization](docs/permissions.md)
- [Implementation plan](docs/implementation-plan.md)
- [Known limitations](docs/known-limitations.md)
