# Cycle 32 · original owner source filtering

Parent: `43e622b16aa952f5dc2fe7ae9f96260b47682c2e`.
Branch: `codex/cycle32-owner-filter-navigation`.
Author: `/root/cycle25_finance_intelligence_resume`.

The existing owner-action selector performs a full currentness check in its render
and immediately calls `filterOwnerActionSources`, which performs that same check
before and after reading its original rows. There is no await between those calls.
Every search edit therefore repeats one full guard before the already guarded
filter. No separate authority is supplied by that extra invocation.

Controlled-state rendering of the actual component with the four-job native source
set measures 780 native `readSyntheticPrototypeSources` calls for each of the three
brands. One original pre/post-guarded filter performs 520. The initial twelve-case
regression records nine passes and three redundant-work failures, each exactly
260 calls above the guarded-filter result.

Only `src/components/workflows/OwnerActionVerification.tsx` changes. It performs
the unchanged guarded filter inside its existing denial boundary and preserves the
separate currentness check for a retained refresh comparison. Any failure clears
the filtered presentation and withholds private choices, comparison facts and
actions through the existing current flag and alert. The original filter's two
fresh checks, original order, literal text behavior and exact selection remain
unchanged. No currentness result, authorization or reader is cached. The action
verification, explicit confirmation, callback generation, source refresh,
post-await checks, original navigation and one-use/UNKNOWN custody are untouched.

The corrected render performs 520 calls for each brand, matching the unchanged
guarded filter. This is a concrete reduction in repeated source work, not a
universal typing-latency guarantee or a replacement for responsive browser testing.
The tests use controlled React state with real native read handles, not a physical
browser or genuine authenticated session.

The focused run passes **23/23 cases**, zero skipped: twelve new regressions and
eleven retained exact-selection and navigation cases. Scoped lint and formatting
pass. The twelve new cases cover the measured three-brand path, revocation, actual
material-source changes, a stale refresh comparison with an otherwise fresh view,
literal no-hit search retaining the exact selected source, and source-free
default-OFF rendering. Main records combined strict types, actual
browser results, source admission and exact-head CI in Cycle 32 validation. Raw
RED/GREEN reports and measurements stay private under
`.staging/program-cycle32/evidence/intelligence/`.

No markup, style, branding, artwork, route, navigation owner, data store, ranking
engine, financial command or connected capability is added. Original visual
approvals remain unchanged; newer Operating Center and advanced scopes remain
pending. All protected migrations, customer14/4B, frozen P1/four artifacts, Netlify,
recovery, Auth/MFA, NMI and production restrictions remain intact. No hosted
mutation, payment, dispatch, communication, operational restoration, merge or
deployment is authorized. Release 1.0 remains NOT READY / NOT AUTHORIZED.
