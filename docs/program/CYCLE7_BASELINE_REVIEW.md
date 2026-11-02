# Cycle 7 baseline: independent combined review

Verdict: **CLEAR for further bounded local composition after retaining Main's
contractor-return fix**. This review covers all eight Cycle 6 workstreams: the
coordinator plus seven independently owned packages. It grants no merge, deployment,
operational or release acceptance. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.

Reviewer `/root/cycle6_integration_review` used the isolated
`codex/cycle7-integration-review` worktree from exact coordinator
`7b83aff9810c4055bcdcd73fd2d20f6f53c3c893`. Main reports the later coordinator commit
`a6ea48fec561754bfb9d393996661c0b1cec4830` changes CI's finite timeout only;
this source review does not substitute a prior green result for any new commit.

## Exact sources

| PR  | Workstream                                        | Reviewed commit                                                  |
| --- | ------------------------------------------------- | ---------------------------------------------------------------- |
| 38  | Main runtime, route, composition and cancellation | `7b83aff9810c4055bcdcd73fd2d20f6f53c3c893` plus Main's fix below |
| 39  | Sales                                             | `d2909a470713e808bc324a2e5d67b2a3967c94af`                       |
| 40  | Field                                             | `9e8ed2d7502a75fbcc4c36d9ec9dfff7d0042917`                       |
| 41  | Finance                                           | `f115a428ffd41c285051bfc41e5278614217b02c`                       |
| 42  | Customer                                          | `c0f5276431cba959d4814497a6ae948b40eedd7d`                       |
| 43  | Growth                                            | `2f63fce4b97bdcf9667f1f6acfbcf1f498d736c9`                       |
| 44  | Intelligence                                      | `bc52dffaf8720c5124df6ff63663ccc91b715525`                       |
| 45  | Secondary Operations                              | `43e5145759c8efa9e66426d251beab958d834113`                       |

The new provenance probe reads the actual Git objects for all seven author heads,
compares their 38 disjoint owned files with the combined checkout and checks the
recorded SHA-256 values. This does not rely solely on the delivery register's claims.
The coordinator owns the shared runtime, route, design/register/checker integration;
it is not miscounted as an eighth business engine.

## Confirmed finding and closure

**C7-R1 — coordinator contractor-return state, closed by Main's pending source fix.**
An actual Chromium probe prepared company A and B, returned to A and confirmed the
simulation. At the exact baseline, the old A journey stayed hidden while Prepare was
enabled. The handler then silently returned because its attempts Map already retained
A. The visible state tracked only the most recently prepared company. This was a
usability/state defect; the existing Map correctly prevented duplicate preparation.

Main changed only the contractor-select presentation: it retrieves the selected
company's exact retained attempt and sets visible state/result, or clears it when
none exists. Confirmation is still required. No new attempt, replay, replacement ID,
authority or business write was introduced. READY/UNKNOWN/PENDING evidence remains
retained. The reviewer copied this one Main-owned file temporarily for validation;
the reviewer commit does not include or independently modify business source.

Validated fixed file: `src/components/workflows/ContractorJourneyPreview.tsx`, SHA-256
`06ce6895f5838ef633c3a3951635bc2a30bcab045a0fab1d1d49c1280554ded6`.
Main must retain that fix in its next exact source commit; its SHA was pending when
this review was written. The new browser probe failed against the unchanged baseline
and passed with this exact fixed file.

## Focused evidence

- **17 retained independent cases PASS** against the isolated exact combined source.
  Existing evidence was reused, not recreated: six actual same-engine workflows,
  exact source identities, canonical Finance amounts, immutable issued/packet evidence,
  customer-safe projection, source/selector races, revoked access, real second-job
  evidence with identical wording, consent withdrawal, UNKNOWN and secondary Operations.
- **2 new probes PASS after Main's fix**: exact Git/source provenance and the actual
  two-company-return Chromium interaction. Combined focused run: **19 PASS**, not an
  added repetition of the earlier 273/315-case totals.
- `node scripts/check-cycle6-integrity.mjs` PASS: seven exact author packages,
  38 disjoint reviewed paths, **128 protected hashes, five locked design/artwork files
  and thirteen bindings**. No protected hash or assertion was weakened.
- The browser used disposable HTTP loopback port 4217 and was closed with its server
  after the probe. It did not reuse the owner's existing preview. No persistent work
  or hosted access was introduced.

The source test runs ordinary SHA/disjoint ownership assertions in the application
suite without Chromium. Its explicit local Git-object mode additionally requires the
unmerged author objects, which ordinary shallow CI need not have. The browser probe
is separate at `tests/program/cycle7-baseline.spec.ts`, under the dedicated
`tests/program/playwright.cycle7-review.config.ts` harness; it is not part of Vitest:

```sh
PROPEL_CYCLE7_BASELINE_REVIEW=true npx vitest run tests/cycle7-baseline-review.test.ts tests/cycle6-operations-independent-review.test.ts tests/workflows/cycle6-independent-review.test.ts
npx playwright test -c tests/program/playwright.cycle7-review.config.ts --workers=1
node scripts/check-cycle6-integrity.mjs
```

Without the Git review flag, no Git-object provenance pass is claimed from a shallow
application run. This flag grants no application capability. Prior actual responsive,
accessibility and production-default-OFF evidence remains retained; the reviewer
did not unnecessarily repeat those completed suites or manually restart successful CI.

## Data ownership and authority assessment

The combined journey reuses the same actual Operations, Phase3Repository,
PropertyRepository, ReleasePreview and customer model instances. Exact tenant,
customer, CRM location, estimate/version, job, receipt and report/version references
cross the modules. Lead association is an explicit staff selection because the
estimate has no recorded lead FK; it is not fabricated origin provenance. Contracts
remain preparation only. Field date-only proposals do not establish dispatch or
available hours. Finance uses canonical costing and issued-safe scope, with no invoice,
debt, ledger or payment creation. Passport exposes selected published documentation,
not verified physical completion, warranty or customer acceptance.

Maintenance proposals and consent-aware opportunities remain staff review only.
Consent currentness is CAPTURED_NOT_ATOMIC/current authority UNKNOWN. Copilot,
literal Voice/Trade and Procurement reviews are source-bound suggestions without an
action executor. Secondary booking/offline/Storm/Network composition remains unmounted;
its global workforce currentness is CAPTURED_NOT_ATOMIC/capacity authority UNVERIFIED,
and Network is not endorsement, access or delivery. UNKNOWN reconcilers do not replay
commands or invent replacement identities.

No new business store/schema, live customer route, credential loader, sender,
financial/provider executor or hosted adapter was found in these composed paths.
Thirteen historical migrations, pending customer14/original4B, frozen P1/four artifacts,
approvals, 2A–2F, billing proposals, approved interfaces/artwork, Netlify/executor and
recovery evidence remain unchanged. Genuine authentication/MFA, independent physical
recovery, NMI, legal/tax/provider/financial/communication and all production gates stay
independent and unverified by this local review. No business source, protected file,
hosted state, deployment or merge was changed by the reviewer.
