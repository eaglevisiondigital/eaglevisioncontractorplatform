# Cycle-two independent integration review

Date: 2026-11-01. Independent reviewer: `/root/cycle2_integration_review`.
Integrator: `/root`. Verdict: **CLEAR for isolated local draft-PR review** after
three reproduced P2 corrections. This grants no integration, hosted or release
permission. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

## Exact reviewed candidates

| Package                    | Exact child commit                                                  | Exact reviewed parent                          | Owned files                                        |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Finance export / PR6       | `5329b0cc226f55cef3ee2862cb690cd7ed3f62b4`                          | PR3 `e73afa02f6a20d6f278fa7315c6ae107b404c054` | 3 new                                              |
| CRM pagination / PR7       | `7fc529d1a1c68fd349e70410d79ef8a21cf0e475`                          | PR2 `7556023bf3487aeaab5ddc281c919eb268f8e46f` | 8                                                  |
| Maintenance schedule / PR8 | `a85946557f449f3ae944d609c4eaa9e028c3f665`                          | PR4 `32e84df780b650e4a85318defc9666aa5573ea91` | 9                                                  |
| Passport foundation / PR9  | `081532fa1e7ec06d0bc9c02700ba018070a0cb2c`                          | PR5 `e44d668fe8bfd262be126020a0c1be9fa110046b` | 3 new                                              |
| Main design/evidence       | Current coordination candidate; main draft PR head is authoritative | PR5 `e44d668fe8bfd262be126020a0c1be9fa110046b` | Shared checker/spec/register, no App/domain writer |

A disposable checkout combines exact parent and child patches for compatibility;
no Git branch merge, parent rewrite or operational promotion occurred. Independent
review verified all owned bytes against those commits and the reviewed main files.
Its public inventory has 426 files; all 34 source deltas from exact e44 belong to the
reviewed parent/child/main packages. The root source inventory deliberately excludes
unmerged child code. Shared domain objects remain authoritative; no parallel store,
schema, ledger, estimate engine or connected capability was introduced.

## Reproduced findings and closure

1. **Finance primitive projection — CLOSED.** Boxed source enum values were admitted
   through coercion, bypassing reconciliation branches and retaining caller objects
   in supposedly safe output. Parent replaced coercion with strict primitive enum
   admission. Five focused regressions reject object values without invoking custom
   serializers or freezing caller objects. Independent reproduction 2/2 and final
   finance suite 65/65 pass. Reviewed module SHA-256:
   `08c60da326b2cc2d65878357649d39884a01e5f5ec5b707cbb6d6193114a421c`.
2. **Passport evidence/hash detachment — CLOSED.** Inherited report enum validation
   coerces objects, permitting private fields and mutable aliases into a Passport
   snapshot. Scoped primitive phase/severity admission now precedes the inherited
   projection; historical report-page source is unchanged. Six regressions reject
   objects/boxed strings and source replacement during hash await, without coercion,
   serialization or caller freezing. Independent reproduction 2/2 and final Passport
   suite 48/48 pass. Reviewed module SHA-256:
   `757917b2068049a8d43064283e030b3df57b41accdc5bf8f8c5ac598c05dd739`.
3. **Optional design-contract bypass — CLOSED.** Deleting the manifest pointer could
   skip all design validation. The exact path is now mandatory, as are five locks
   and 13 bindings. Negative omission/dropped-lock tests plus 24 evidence/design cases
   pass; independent original omission proof now rejects. Source/hash validation
   never grants design approval. Reviewed checker SHA-256:
   `778269b213d3970858c044919b17fe0fe18f85b7ac00f5e5e6c51cbdab5b6d47`.

## Review scope and functioning limits

- **Types and data ownership:** CRM extends existing exact/paged Operations readers
  and guarded engine save; no estimate math changes. Field calls only the existing
  scheduleMaintenance after exact source/record/plan/member/CAS review. Finance
  reads existing Invoice/PaymentEvent/LedgerEntry/verifyLedger. Passport reads current
  customer/property published evidence and existing projection/hash functions.
- **Tenant/customer/property isolation:** exact boundaries, current relationships,
  source identities and async stale-context checks are covered. Source IDs, browser
  selections and flags do not confer Auth. No foreign-row dropping/nearest fallback.
- **Privacy:** finance and Passport are strict detached allowlists. Internal notes,
  costs/margins/payroll, unrelated records and private repair evidence do not cross
  customer-safe contracts. UNKNOWN/incomplete evidence never becomes zero, settled,
  repaired, complete or physically verified.
- **Uncertainty/ownership:** field retains one repo-scoped in-memory attempt across
  adapter recreation and reconciles exact postconditions read-only. It claims no
  refresh/process durability or genuine authority. Export/Passport have no writer,
  network port, App route, response/delivery or persistence capability.
- **Accessibility and compatibility:** independent reviewer inspected source/control
  semantics and actual CRM and field desktop/mobile review/prepared/UNKNOWN images.
  Integrator/author browser results below are separate evidence. No locked UI/CSS or
  artwork was modified. The handoff remains separately flagged DEV/loopback only.

## Test evidence and provenance

Independent reruns: CRM 17 new cases; field 51 current cases; finance 65 current cases
plus 2 original fault reproductions; Passport 48 current cases plus 2 original fault
reproductions; main 24 evidence/design cases plus the original omission proof.
These overlap author/integrator suites and must not be added to inflate coverage.

Integrator combined validation: 179 initially passing cases across six suites, then
final changed Passport 48/48 including six additional cases: **185 distinct focused
cases**. Combined strict types/lint/build pass. 9 actual CRM browser cases and 6
handoff cases pass across desktop/tablet/mobile and all three brands, with keyboard,
focus, exercised axe, overflow and exact source/UNKNOWN checks. No unrelated green
full suite was manually rerun. Normal automatic CI remains unchanged and is recorded
against exact SHAs in the master register and GitHub runs.

Offline migration/property/customer/4B/broker/generated-type checks pass. They prove
local preserved source, not hosted installation, genuine Auth or operational custody.
The main features checker preserves 25 records/original 18 IDs and enforces 5 unchanged
CSS/artwork locks/13 source bindings. Runtime acceptance is NOT_INFERRED.

## Protected integrity

Independent public preservation set: 125 files under existing supabase/recovery/
server/netlify/public plus README, netlify.toml, package-lock and three locked CSS
files match exact e44 in the combined snapshot. Aggregate SHA-256 over the sorted
[path,sha256] list:
`c16893f883e6816534b50b6def3f3722778f74f9ed35304908d9e50e730b3b49`.
Main additionally verified 102 protected tracked paths across all five worktrees
and five retained private P1/Netlify frozen bindings by hash only; no private content
or correspondence was exported, staged or logged. These different scopes overlap.

All thirteen historical migrations, pending customer14, original 4B/broker, frozen
P1/four artifacts and approvals, original Netlify archive/executor,2A–2F, six proposed
billing enhancements and approved interfaces remain intact. No new dependencies or
protected files were changed. Physical recovery, original P1-on 13, separate 14/exact
4B+broker operational acceptance, NMI/Auth/provider/financial/communication, hosted,
production deployment/merge and launch gates remain independent and closed.

## Remaining review boundary

All candidates stay draft and unmerged. Parent/child integration needs the owner's
separate review/authorization; exact final CI must be green. Export is not accountant
approval or settlement; Passport is not physical proof/warranty or full history;
field scheduling is not dispatch, repair or customer authority. Local SHA-256 and
source tests do not prove operational recovery/Auth/provider/security acceptance.
No claim of persistent unattended agent or monitor activity follows this session.
