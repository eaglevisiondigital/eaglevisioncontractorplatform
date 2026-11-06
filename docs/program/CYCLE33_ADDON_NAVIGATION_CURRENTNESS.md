# Add-on navigation · final original-source currentness

**Source-only correction. Release 1.0 remains NOT READY / NOT AUTHORIZED.**

Parent: `038b64acad56e436a016905dfec87aef86dcfbc8` (coordination draft #279).
Author: `/root/v1_independent_combined_review`. The package is M1/A2: only the
existing `navigateAddonReadinessJob` function, one new regression suite and this
document. Independent peer review remains separate from authorship.

## Demonstrated boundary and correction

The original function inspects an exact retained add-on record, verifies current
source and job identity, then captures the live callback/generation before calling
it. Strict own-property descriptor capture can execute Proxy traps. A trap at that
last capture previously revoked the actual original native owner, yet the callback
still received the private job and navigation returned it. A synchronous callback
could also revoke its owner and still return local success.

Two calls to the existing `assertAddonReadinessCurrent(task)` now run after the
final callback capture and after the unchanged synchronous callback, before return.
The original source owner validates membership, company/customer/property/job,
issued source, selected mode/edition, gate and native currentness. No copied
reference, hash or callback becomes authorization. The original callback type,
generation checks, inspection, parameters and job return value remain unchanged.

This local navigator has no permanent one-use navigation claim. Known callback
withdrawal or a known thrown callback may be followed by a separately explicit
current navigation; successful navigation can be repeated. This correction adds no
pending registry, retry worker or command custody. Observed source/gate/revocation
failure retains the existing original UNKNOWN controls. It does not release any
underlying proposal/command hold or authorize replay, sync, messages or dispatch.

## Actual local evidence

Only the new
[`cycle33-addon-navigation-currentness.test.ts`](../../tests/cycle33-addon-navigation-currentness.test.ts)
collection was executed. Original 30-second test/hook budgets, zero retries and
one worker were retained. No old successful cohort or browser collection was rerun.

| Execution                                                      | Actual result                         | Raw JSON SHA-256                                                   |
| -------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| Original private minimal final-capture audit, unchanged parent | 0 PASS / 3 FAIL                       | `6a123cc79394a0b6d7cb1f192fbfccaa9658a58ee7275576d1a1c222cb3e071d` |
| Unchanged parent, six new revocation cases selected            | 0 PASS / 6 FAIL / 22 filtered         | `7baaeb2ac9bd2fdc8b02b1444b4898ebc4cba42bc501ed29fec992c011c2ca3e` |
| Corrected source, full new collection                          | 28 PASS / 0 FAIL / 0 skipped / 0 todo | `d14dc03ab93f3b0c2efcf636d794faf869ac10de90fe4aee39d7d6ed6e3444bf` |

The three original brands use existing `prepareOperatingSources` records and
`offline`/`property_services` review inputs. Native `operations.configure` establishes
a remaining owner; actual `revokeOwner` changes current membership. Authorization
is not mocked. All three brands reproduce both windows and verify that final-input
revocation withholds the callback and callback-time revocation withholds success.
No genuine Auth/MFA or every-add-on-mode acceptance is claimed.

The complete collection also verifies:

- Exact job/source/mode/edition continuity and explicit repeat without canonical
  business, financial or network effects.
- Pre-invocation generation withdrawal without consuming original controls;
  confirmation withdrawal and observed native revocation retain UNKNOWN after
  restoration.
- Canonical estimate revision makes the old source stale. Original copied task
  handles and foreign report references are denied. A literal copied reference
  DTO retains its exact identity through the original native record lookup; it
  gains no independent authority.
- Accessor callback fields are rejected without executing their getters. Known
  callback exceptions do not create fictional one-use claims. Production and
  remote admission stay OFF for previously retained local controls.

Strict TypeScript, scoped lint/format and protected-design feature checks are
reported separately by the author. These local results do not imply new-head CI,
combined browser, visual approval, Foundation or operational acceptance. Main owns
shared source admission, manifests, registers and independently reviewed integration.

## Preserved boundaries

No component, CSS, artwork, canonical engine/store, schema, receipt format,
provider, operational adapter or recovery artifact changes. Current source guards,
default-OFF gates and original UNKNOWN/no-replay controls remain authoritative.
The existing protected migrations, original P1-on13 approval and prerequisites,
customer14/4B/broker, Auth/MFA, NMI/settlement, financial, communication, Netlify,
branding/design, hosted and production restrictions stay intact.

All eleven D1 role assignments remain UNASSIGNED; D2/D3 require separate
owner decisions and A01–A12 remain NOT_RUN. The November4 owner-witnessed main
synthetic network-loss PASS stays scoped to that scenario. Duplicate recovery stays
UNKNOWN/UNVERIFIED; both private run folders and uncertain custody remain untouched.
No physical test, hosted acceptance, payment, dispatch, communication, restoration,
merge or deployment is performed or authorized by this package.
