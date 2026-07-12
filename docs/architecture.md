# Architecture

## Status and evidence

This is a design document, not an implementation record. At review time the repository contains only `PRODUCT_SPEC.md` and `.gitignore`; it has no `manifest.yml`, `package.json`, application source, or installed project dependencies. The local toolchain, when NVM is loaded, is Node 22.16.0, npm 11.9.0, and Forge CLI 13.1.0.

Labels used throughout these documents:

- **Confirmed** — supported by the current official Atlassian documentation or observed local tooling.
- **Assumption** — a design choice that still needs product or implementation validation.
- **PoC required** — must be proven on a Jira development site before committing the MVP design.
- **Deferred** — intentionally outside the MVP or a later product phase.

Official references were checked on 2026-07-12. Forge changes over time, so re-run `forge lint` and re-check the linked references when the manifest is created.

## Proposed system

Jira Policy Guard should be a single Forge app with one hosted backend and one shared Custom UI bundle. Its core is a pure TypeScript policy engine. Forge and Jira integrations sit behind application ports so policy evaluation can run in ordinary unit tests.

```text
Jira project/admin/issue UI
             |
        Custom UI + bridge
             |
   thin resolver/validator handlers
             |
        application use cases
        /         |          \
 pure domain   repositories   Jira gateway
    engine          |             |
               Forge KVS/CE    Jira REST API
```

Dependency direction is presentation -> application -> domain. Infrastructure implements application interfaces and may depend on Forge packages; the domain must not.

### Layer responsibilities

| Layer          | Responsibilities                                                                                                           | Must not contain                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Domain         | Versioned policy types, schema validation, applicability matching, operator/requirement registry, deterministic evaluation | Forge imports, REST calls, storage calls, UI types                        |
| Application    | Create/update/delete/list, evaluate/test, import/export, authorization and feature-limit orchestration                     | Manifest/module details, React components                                 |
| Infrastructure | Custom Entity/KVS repositories, Jira REST adapter, current actor/permission adapter, clock/ID implementations              | Policy decisions                                                          |
| Presentation   | Custom UI, resolver definitions, workflow validator handler, issue-context queries                                         | Persistence logic or trusted authorization decisions from browser context |

All resolver input and imported JSON is parsed at the boundary. Use cases perform authorization, concurrency checks, and limits. Repository writes and audit writes should use a Custom Entity transaction where they must be atomic; transactions are a **confirmed** capability, currently limited to 25 operations and a 4 MB payload ([transactions](https://developer.atlassian.com/platform/forge/storage-reference/entities-transactions/)).

## Forge module map

| Module                     | Proposed key                    | Phase    | Status and role                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jira:projectSettingsPage` | `policy-guard-project-settings` | 1        | **Confirmed.** Project-admin-only settings surface; Custom UI resource plus hosted resolver. The module is documented as accessible only to project admins, but backend authorization remains mandatory ([reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-project-settings-page/)).                         |
| `jira:adminPage`           | `policy-guard-admin`            | 4        | **Confirmed.** Correct site-admin surface for global policy administration. Prefer this over `jira:globalPage`, which is an Apps navigation page rather than an admin-only settings page ([reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-admin-page/)).                                                   |
| `jira:issueContext`        | `policy-guard-issue-context`    | 2        | **Confirmed.** Collapsible issue-view context with Custom UI and resolver; available in the new issue view, not the old one ([reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-context/)).                                                                                                             |
| `jira:workflowValidator`   | `policy-guard-validator`        | 2        | **Confirmed Preview / PoC required.** Function validator for company-managed workflows first. Validate transition-screen modified fields, configuration behavior, latency, error text, editor compatibility, and audit feasibility ([reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/)). |
| `function`                 | `resolver`                      | 1        | **Confirmed.** Shared resolver handler for eligible UI modules.                                                                                                                                                                                                                                                                                       |
| `function`                 | `workflow-validator`            | 2        | **Confirmed Preview dependency.** Dedicated handler and timeout budget for transition enforcement.                                                                                                                                                                                                                                                    |
| `jira:issuePanel`          | none initially                  | Deferred | **Confirmed but deferred.** Add only if issue context cannot present usable violation detail; do not register both by default.                                                                                                                                                                                                                        |

`jira:globalPage` is not proposed for global administration. It is confirmed to exist, but it is a general Apps navigation surface and only one may be registered per app ([reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-global-page/)).

### Proposed manifest shape

This is illustrative syntax, not a checked-in manifest. The future registered app ID must replace the placeholder.

```yaml
modules:
  jira:projectSettingsPage:
    - key: policy-guard-project-settings
      resource: policy-guard-ui
      resolver:
        function: resolver
      title: Jira Policy Guard
  jira:adminPage:
    - key: policy-guard-admin
      resource: policy-guard-ui
      resolver:
        function: resolver
      title: Jira Policy Guard
  jira:issueContext:
    - key: policy-guard-issue-context
      resource: policy-guard-ui
      resolver:
        function: resolver
      title: Policy Guard
      label: Policy Guard
  jira:workflowValidator:
    - key: policy-guard-validator
      name: Jira Policy Guard
      description: Enforces enabled Jira Policy Guard policies.
      function: workflow-validator
      projectTypes:
        - company-managed
  function:
    - key: resolver
      handler: src/presentation/resolvers/index.handler
    - key: workflow-validator
      handler: src/presentation/validators/index.validate

resources:
  - key: policy-guard-ui
    path: static/policy-guard-ui/dist

permissions:
  scopes:
    - storage:app
    - read:jira-work

app:
  id: ari:cloud:ecosystem::app/REPLACE_AFTER_FORGE_REGISTER
  runtime:
    name: nodejs24.x
```

The syntax above follows the current module and manifest references. It cannot pass `forge lint` until an app is registered, source/resources exist, and the exact storage schema is added. `nodejs24.x` is currently recommended by the [manifest reference](https://developer.atlassian.com/platform/forge/manifest-reference/); local development must move from Node 22 to Node 24 to avoid runtime mismatch.

## Initial repository structure

```text
.
├── manifest.yml
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.js
├── prettier.config.js
├── docs/
├── src/
│   ├── domain/
│   │   ├── policy/
│   │   ├── evaluation/
│   │   └── errors/
│   ├── application/
│   │   ├── ports/
│   │   └── use-cases/
│   ├── infrastructure/
│   │   ├── forge-storage/
│   │   ├── jira/
│   │   ├── auth/
│   │   └── licensing/
│   └── presentation/
│       ├── resolvers/
│       └── validators/
├── static/
│   └── policy-guard-ui/
│       ├── src/
│       │   ├── api/
│       │   ├── components/
│       │   ├── features/
│       │   └── routes/
│       └── package.json
└── test/
    ├── unit/
    ├── integration/
    └── fixtures/
```

**Assumption:** one UI bundle with context-aware routing is preferable to duplicate bundles. Confirm the project settings, admin, and issue-context layouts all behave acceptably before retaining this choice.

## Dependency baseline

There are no project versions to preserve. Registry lookups on 2026-07-12 returned the following current versions; these are a reviewed starting point, not permission to install them automatically:

| Package/tool       | Verified version | Proposed treatment                                                                                                             |
| ------------------ | ---------------: | ------------------------------------------------------------------------------------------------------------------------------ |
| Forge CLI          |     13.1.0 local | Pin the documented supported CLI in contributor prerequisites; re-run template generation before Phase 1.                      |
| `@forge/api`       |            8.0.1 | Exact production dependency.                                                                                                   |
| `@forge/resolver`  |            2.0.0 | Exact production dependency.                                                                                                   |
| `@forge/bridge`    |            6.1.0 | Exact UI dependency.                                                                                                           |
| `@forge/kvs`       |            2.0.1 | Exact production dependency; preferred over legacy storage exports from `@forge/api`.                                          |
| React              |           19.2.7 | **PoC required:** use the Forge template/Atlaskit peer-compatible major if it differs.                                         |
| `@atlaskit/button` |           24.3.0 | **PoC required:** add only components actually used; verify peer dependencies and Custom UI rendering.                         |
| Zod                |            4.4.3 | Exact dependency after bundle/runtime test.                                                                                    |
| TypeScript         |            7.0.2 | **PoC required:** do not adopt automatically; use the latest stable version supported by the generated Forge/tooling baseline. |
| Vitest             |           4.1.10 | Proposed test runner; verify Node 24 and coverage tooling compatibility.                                                       |

Commit the root lockfile. The current `.gitignore` excludes `package-lock.json`; Phase 1 should deliberately change that because reproducible commercial builds matter more than the inherited ignore rule.

## Execution paths

### Administration

1. Custom UI invokes a named resolver with a schema-versioned DTO.
2. Resolver parses input and obtains only secure invocation context.
3. Authorization service verifies site/project permission through Jira rather than trusting browser-supplied project IDs.
4. Use case enforces feature limits and optimistic version checks.
5. Repository transaction writes the policy and audit record.
6. Resolver returns a minimal response DTO.

### Transition validation

1. Jira invokes the workflow-validator function.
2. Adapter normalizes issue, transition, configuration, and `modifiedFields`.
3. Repository loads enabled global/project policies through bounded indexed queries.
4. Jira adapter fetches only missing data that cannot be obtained from the invocation.
5. Pure engine returns all violations.
6. Handler blocks on `ERROR` violations and returns a bounded, user-safe message.
7. Failure audit is written best-effort unless the PoC proves an atomic/enforced approach within the invocation budget.

**PoC required:** determine whether one installed workflow validator can dynamically enforce the app's stored policy set across the intended workflows, and how administrators attach it. Policy creation alone cannot automatically make a validator run on every transition.

## Architecture decisions

- Use stable Jira IDs in persisted policy references; names are display snapshots only.
- Keep policy definitions as discriminated unions, not an open `Record<string, unknown>` inside the domain.
- Use custom entities for queryable policies/audits and KVS keys for small singleton metadata such as migration state.
- Make audit records append-only; corrections are new events.
- Treat warning policies as informational in the MVP; only errors block transitions.
- Bound every list and audit query with cursor pagination.
- No Forge Remote, external database, external egress, telemetry, or secrets in MVP.

## Assumptions and open decisions

- “Global” means all projects in one Jira site/Forge installation, not an Atlassian organization spanning sites.
- MVP enforcement will start with company-managed projects. Team-managed support depends on validator PoC results.
- Project administrators may manage project policies; only Jira/site administrators may manage global policies.
- Policy deletion is soft deletion for recoverability and audit integrity; product must confirm retention expectations.
- The product owner must define precedence when global and project policies conflict, retention periods, maximum regex length, audit visibility, and whether warnings appear during transitions.
