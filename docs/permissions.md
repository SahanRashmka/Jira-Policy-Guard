# Permissions and authorization

## Least-privilege baseline

Initial Phase 1 manifest proposal:

```yaml
permissions:
  scopes:
    - storage:app
    - read:jira-work
```

| Scope                       | Status                         | Why needed                                                                                                                                                                                                                                                                         | Not authorized by this scope alone                                                          |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `storage:app`               | **Confirmed, Phase 1**         | Required by `@forge/kvs` for KVS and Custom Entity persistence ([reference](https://developer.atlassian.com/platform/forge/storage-reference/entities/)).                                                                                                                          | A user’s right to read or modify a particular policy.                                       |
| `read:jira-work`            | **Confirmed, Phase 1**         | Read issue/project data for field discovery, dry-run evaluation, issue context, and transition modified fields. The validator reference explicitly requires it for `modifiedFields`.                                                                                               | Jira administration or issue writes.                                                        |
| `manage:jira-configuration` | **Conditional / PoC required** | Official workflow-validator configuration examples and failed-expression event subscription require it. Add only when Phase 2 uses those capabilities ([validator reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/)). | Blanket permission for arbitrary app behavior; application authorization is still required. |
| `read:jira-user`            | **Deferred / PoC required**    | Classic recommended scope for group lookup/member APIs needed by the user/group rule ([Jira group API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-groups/)).                                                                                            | Group modification.                                                                         |

Do not request `write:jira-work`, external egress, offline impersonation, or user/group write scopes for the documented MVP. Recheck every concrete REST endpoint’s current scope before adding it. Adding scopes to an installed app requires administrator reapproval, which is a confirmed Forge constraint ([Forge security](https://developer.atlassian.com/platform/forge/security/)).

## Authorization matrix

| Operation                                                | Required actor authorization                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| View project policies                                    | Browse project plus access to project settings; MVP UI is project-admin surface                            |
| Create/update/clone/enable/disable/delete project policy | `ADMINISTER_PROJECTS` for the authoritative project ID                                                     |
| Test/import/export project policies                      | `ADMINISTER_PROJECTS` for the target project; audit export also requires plan entitlement when implemented |
| View/change global policies                              | Jira/site administrator; verify through a Jira permission API, not page location alone                     |
| View issue-context results                               | Permission to browse the issue/project; do not reveal policies for inaccessible projects                   |
| Execute workflow validation                              | Jira invokes the module; evaluate only policies for the invocation’s authoritative project/issue context   |
| View audits                                              | Same scope administrator as the audit partition; global audits require site admin                          |

The project settings module is documented as project-admin-only, and the admin page is an admin settings surface. These are useful defense-in-depth controls, not backend authorization proofs.

## Resolver authorization pattern

1. Parse input with Zod; reject extra or malformed fields.
2. Read actor identity and module context only from the resolver’s secure invocation context. Browser `view.getContext()` and payload values are not authorization inputs.
3. Resolve the authoritative project/issue from Jira where the operation needs it.
4. Prefer Jira requests `asUser()` for user-initiated reads so Jira applies the actor’s permissions.
5. Before an `asApp()` request, explicitly verify the actor’s expected Jira permission.
6. Authorize before reading sensitive records as well as before writing.
7. Record allowed privileged mutations with actor account ID; record denied attempts only if a privacy-safe security logging policy is adopted.

Atlassian explicitly says browser context must not be used for authorization and describes resolver invocation context as the secure source ([app context security](https://developer.atlassian.com/platform/forge/app-context-security/)). Its shared-responsibility guidance requires `asUser()` for user operations and permission checks before `asApp()` calls ([shared responsibility](https://developer.atlassian.com/platform/forge/shared-responsibility-model/)).

## Data handling

- Return only fields required by each screen. Never return storage documents wholesale when a list DTO suffices.
- Treat Jira account IDs as personal data. Store them for audit accountability, not display caches or analytics.
- Never put secrets, Forge environment variables, raw stack traces, or authorization decisions in Custom UI.
- Escape text by normal React rendering; do not use `dangerouslySetInnerHTML`. Jira group-picker responses can contain HTML highlights; ignore that HTML and render plain names.
- Allow-list audit metadata and redact issue field values from logs.
- Validate user-controlled failure messages and render them as text.
- Do not add CSP `unsafe-inline`, `unsafe-eval`, external fetch, font, image, or script permissions unless a concrete bundled dependency requires one and the risk is documented.

## Regex safety

JavaScript regex execution has no native timeout. For text-pattern policies:

- cap pattern and tested-input lengths;
- allow only documented flags;
- compile at save/import time and reject syntax errors;
- perform static unsafe-pattern checks or use a vetted safe-regex strategy;
- avoid repeated/global-state bugs by controlling flags and resetting state;
- measure evaluation duration and fail closed with a generic technical error;
- evaluate an alternative linear-time engine in a PoC if MVP regex expressiveness permits it.

This mitigates but does not prove elimination of ReDoS. Regex rules remain Phase 3 and require a security PoC.

## Permission-related PoCs

- Confirm exact Jira REST endpoint and scope for project-admin and global-admin checks in Forge `asUser()` context.
- Confirm workflow-validator invocation identity and whether all required issue data can be obtained without broad configuration scope.
- Confirm group membership visibility across Jira permission configurations; the REST API itself requires Browse users and groups or admin-level permissions for relevant operations.
- Confirm app-access-rule behavior for issue data and how blocked fields affect fail-open/fail-closed policy behavior.

## Deferred permissions

- No Forge Remote or external network egress.
- No issue modification scopes.
- No group or user modification scopes.
- No offline user impersonation.
- No Marketplace licensing scope/design until Phase 5.
- No telemetry permissions until a disclosed, consent-aware design exists.
