# Retained Field navigation return contract

This bounded correction starts at exact draft302,
`523afd4ef17d5502b6e0e39a4df86bdaa7bba23b`. It changes only the existing
`field-workspace.ts` native consumer, one new regression file and this note.
Main owns shared contracts, source admission, checkers, workflows and registers.
No old test, source pin, UI, schema, canonical store or operational adapter changes.

## Demonstrated retained-context defect

The original `navigateFieldWorkspace` callback type is synchronous `void`. Its
existing canonical navigation outcome is owned by the original WeakMap keyed by
Operations and exact organization/job. Before invocation it reserves PENDING;
known success releases that reservation, while its existing catch preserves
UNKNOWN across fresh wrappers, selected technicians and source revisions.

The native consumer ignored the callback's return value and performed no current
source check after invocation. Across all three actual Ops/Phase3/Property fixtures:

- A callback returning a pending native Promise let the native function resolve
  and a fresh same-job wrapper invoke another callback before the first Promise
  rejected. The original reconciliation still reported CURRENT_REVIEW_ONLY.
- A synchronous void callback invoking actual `Operations.revokeOwner` also let
  navigation resolve after native membership became inactive. Regrant and a fresh
  same-company/job wrapper then admitted another invocation instead of preserving
  the uncertain original outcome.

These are local presentation-navigation defects, not dispatch or a business-command
receipt. The direct native port is the reproduced boundary; no broader rendered UI
or asynchronous-host behavior is claimed from native tests alone.

## Narrow correction and limits

The same function now captures the return value as unknown and accepts only
`undefined`, preserving its original synchronous-void contract. Any other value
throws into the existing UNKNOWN holder. It never reads or adopts `then`,
`constructor`, other getters or Proxy properties. It does not await or extend the
callback contract. After a valid void return, the original current-source check
now runs before PENDING can be released. No new registry, hold owner or wrapper is
introduced; original exact read-only/no-replay semantics remain authoritative.

The already invoked callback cannot be cancelled or rolled back by this guard.
An unsupported caller-owned Promise's later rejection remains the caller's
responsibility. The regression harness attaches an observer before invocation only
to retain that rejection as diagnostic evidence; it is not a controller success,
completion receipt or permission to continue. No general safe-thenable handling,
asynchronous UI contract or action-completion authority is claimed.

Existing UI callbacks return void and request React presentation changes; the
normal OperatingCenter callback does not mutate canonical repositories or withdraw
the original gate inside that synchronous call. Existing UI wrappers may hide a
caller Promise behind their void return; this native correction does not claim to
observe that hidden Promise. Browser/focus verification belongs to the separately
reviewed combined candidate. A known no-op void callback remains valid and proves
neither that navigation occurred nor that work completed.

## Actual targeted evidence

All runs use original30-second test/hook budgets, worker1/retry0, local Node24.20.0,
the Vite runner loader and existing pinned packages. No old191/21 cohort is rerun.

| Separate execution                                     | Actual result          | Raw JSON SHA256                                                    |
| ------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------ |
| Untouched523 native source, new final-return witnesses | 0PASS/6FAIL/0filtered  | `bb9f20e6d5fc45cd5a82906768402f9cf43419f5e5ea69a6a48258da88ca396d` |
| Complete new Field return/source scope                 | 19PASS/0FAIL/0filtered | `e74cd2c68a2ff04d48a5083a5bcd5a23168162b45565c043e0928b4496e8aa61` |
| Original C17 Field workspace34 and C18 Field agenda45  | 79PASS/0FAIL/0filtered | `10f1344bb148047830d699487df3309a7bf446c866e84bdea591258429fb51ba` |
| Original C17 integration, only original field cases    | 5PASS/0FAIL/40filtered | `f3e9a065dc41ad488cfa535e0fc87ae5f9e385fa3dd76a23c30a77d021505a8c` |

Each RED witness confirms the real original behavior before its expected rejection
assertion fails; actual inactive native membership and second-invocation observations
are retained privately. The19 new cases also cover ordinary three-brand sync-void
presentation and no-op behavior, no business writers, actual forecast staleness,
false/objects/foreign then methods/then getters/Proxy returns without property
execution, original UNKNOWN after regrant, OFF, clones and foreign sources. Original
C18 asynchronous continuation behavior remains owned by its separate existing port.
These separate runs are not a single103-case execution or new-head hosted acceptance.

The first strict TypeScript check found only a new-test return annotation that
incorrectly narrowed the existing projection API's `Promise<unknown>` to
`Promise<void>`. Correcting that annotation changed no runtime behavior, assertions
or budgets. The earlier19PASS report remains separate; the table binds the final
same19 cases after that correction. Final strict typecheck, generated-type check,
scoped lint, format, feature/protected checks and production build pass. The build
retains its ordinary large-chunk advisory; no operational acceptance is inferred.

## Preserved release boundaries

Original task, work-order, schedule, maintenance, inspection, Proof of Work and
Offline engines remain authoritative. Human hours/windows are proposals; date-only
availability, physical completion, missing relationships and operational authority
remain UNKNOWN/UNVERIFIED. No sending, dispatch, payment, hosted Auth or restoration.
All128 protected files, five design locks and thirteen bindings remain unchanged.

Eleven D1 roles remain UNASSIGNED, D2/D3 separate and A01–A12 NOT_RUN. November4
remains owner-witnessed main synthetic loss PASS only; duplicate recovery stays
UNKNOWN/UNVERIFIED and both private folders/consumed attempts remain untouched.
Preserve original recovery/P1-on13/customer14/4B, Auth/MFA, NMI/financial/provider,
Netlify, communication, deployment and merge gates.
**Release1.0 remains NOT READY / NOT AUTHORIZED.**
