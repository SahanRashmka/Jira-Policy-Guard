# Known limitations and risk register

This document distinguishes platform facts from design assumptions.

## Confirmed Forge/Jira constraints

- Forge workflow validators are currently **Preview**, not GA. Preview is described as production-suitable for early adopters but can have shorter deprecation windows ([workflow validator reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/)). This is the largest platform dependency in the product.
- A workflow validator must be added to applicable workflow transitions. Creating a policy in app storage does not by itself attach the validator everywhere.
- Function-validator create/edit configuration is supported through Jira’s new workflow editor; editor and project-type parity must be tested.
- Transition-screen `modifiedFields` covers a documented set of field types and requires `read:jira-work`; not every possible Jira field representation should be assumed available.
- `jira:issueContext` works in Jira’s new issue view, not its old issue view ([issue context reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-context/)).
- Forge hosted storage is isolated per app installation, environment, site, and Atlassian product. Therefore “global” can mean site-wide only, not cross-site organization-wide ([storage reference](https://developer.atlassian.com/platform/forge/storage-reference/entities/)).
- Forge storage and functions have installation-level operation, object, invocation, and transaction limits. Transactions currently allow at most 25 operations and 4 MB ([current limits](https://developer.atlassian.com/platform/forge/limits-kvs-ce/)).
- Forge external calls are denied unless declared as egress; MVP deliberately declares none.
- Increasing scopes/permissions on an installed app requires administrator reapproval.
- Browser-supplied Custom UI context is not safe authorization evidence. Authorization must use secure invocation context and Jira permission checks ([context security](https://developer.atlassian.com/platform/forge/app-context-security/)).
- The current official manifest recommends Node 24. Local Node is 22.16.0 and must be aligned before implementation.

## MVP product limitations

- Required-field enforcement is implemented only after an administrator manually adds the Jira Policy Guard validator to a company-managed workflow transition.
- Initial enforcement targets company-managed projects pending PoC. Team-managed support is not promised.
- Only transitions to which an administrator attaches the Forge validator are enforced.
- Policies govern a single Jira site. There is no cross-site synchronization or Atlassian-organization scope.
- Warnings are assumed informational and do not block; product confirmation is outstanding.
- Issue context is advisory at view time and may become stale until refreshed; the transition validator remains authoritative.
- Hard-coded field IDs are avoided, but saved policies can reference fields, options, groups, workflows, transitions, or issue types later renamed/deleted. The app can detect and report some stale references but cannot prevent Jira configuration drift.
- Rich-text, cascading/select, user, multi-value, linked-issue, and third-party custom fields have different payload shapes. Unsupported types must be rejected rather than compared incorrectly.
- The validator error surface may not show every violation cleanly. Results will be bounded, with full detail available in issue context/audit where authorized.
- Audits are app records, not Jira’s native immutable audit log. Retention and export are not defined yet.
- Large imports cannot be assumed atomic because transaction batches are bounded.
- Unexpected storage, Jira API, payload, or evaluation errors fail closed: the transition is blocked with a generic retry/contact-administrator message. Stack traces and issue field values are not returned to users. This favors policy integrity over transition availability.
- The current lambda payload documents destination status IDs but not transition IDs. For the MVP, `Policy.transitionIds` stores destination status IDs and applicability means “transitioning into this status.”

## Proofs of concept required

| Proof                                                 | Why it can change the design                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Dynamic policy set through one function validator     | Establishes whether stored policies can be enforced with acceptable latency and how the validator is attached/configured. |
| New/old workflow editor and project-type matrix       | Determines supported projects and administrator setup.                                                                    |
| Transition `modifiedFields` versus Jira REST snapshot | Prevents evaluating stale pre-transition values; may constrain supported field/rule types.                                |
| Secure project/global admin checks                    | Locks resolver authorization and minimum scopes.                                                                          |
| Custom Entity indexes/transactions                    | Validates query model, concurrency, and audit atomicity against actual manifest validation.                               |
| Regex safety/runtime behavior                         | JavaScript has no regex timeout; determines whether text-pattern rules need a restricted engine/syntax.                   |
| Group membership rule                                 | Permissions, Browse users/groups access, pagination, privacy, and latency may make transition-time checks unsuitable.     |
| Issue link rule                                       | Confirms link direction/type normalization and transition-screen changes.                                                 |
| Shared Custom UI bundle                               | Confirms routing/layout/accessibility across project settings, admin page, and issue context.                             |
| App access rules and restricted issue data            | Determines fail-open/fail-closed behavior when the app cannot read a needed field.                                        |

## Assumptions not yet confirmed

- Site-wide policies can be evaluated efficiently with global and project indexed queries.
- A soft-delete retention model is acceptable.
- One shared UI bundle is maintainable across all three surfaces.
- The app may default development licensing to FREE and enforce three active policies/one project before Marketplace licensing exists.
- Jira IDs used by policy references remain the correct stable identity even when display names change.
- Evaluation-failure audit writes can be best-effort without compromising enforcement; product/security must decide.

## Deferred from MVP

- AI or natural-language policy creation.
- Marketplace billing/licensing implementation (only abstractions/readiness are planned).
- Forge Remote, external databases, external services, and cross-site synchronization.
- Sprint governance, Confluence, advanced analytics, telemetry, and Marketplace submission automation.
- Full template marketplace, policy sharing between installations, and organization-wide control plane.
- Advanced regex engines or arbitrary user-authored code.
- Automated workflow mutation/validator attachment unless a later supported API and security review justify it.
- Full policy version history unless storage/retention costs are approved.

## Operational risks

| Risk                          | Initial mitigation                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Preview validator changes     | Encapsulate the handler adapter, track Atlassian changelog, and gate releases with deployed tests.              |
| Validator latency/rate limits | Indexed bounded reads, policy caps, minimal REST calls, performance tests, safe failure policy.                 |
| ReDoS                         | Length/flag limits, unsafe-pattern validation, representative benchmarks, possibly restricted engine.           |
| Unauthorized policy changes   | Server-side schema validation and Jira permission checks on every read/write resolver.                          |
| Storage growth from audits    | Retention policy, bounded metadata, cursor pagination, scheduled/admin cleanup in batches.                      |
| Jira configuration drift      | Resolve IDs, show stale-reference diagnostics, reject ambiguous fallback by name.                               |
| Dependency/platform drift     | Pin dependencies and lockfile, align Node runtime, CI lint/type/test/build, `forge lint`, deployed smoke tests. |
| Sensitive logging             | Structured allow-listed logs, no field values/import payloads, generic user-facing technical errors.            |

## Not yet verified by execution

No application exists, so no build, typecheck, test, manifest lint, deployment, installation, storage query, module rendering, or Jira transition has passed. Documentation verification establishes that the proposed modules and syntax exist today; it is not equivalent to validating a concrete registered manifest.
