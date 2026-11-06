# Advanced job filtering currentness

Reviewed parent: `8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55`.

The existing add-on readiness job filter validated current native access before
capturing caller filter fields. A descriptor Proxy could revoke the actual native
owner during capture, then receive private job/property rows despite rejection by
the original current reader. All three contractor brands reproduce this disclosure
on unchanged parent runtime bytes.

The filter now keeps the original filtered rows locally and invokes its existing
`assertAddonReadinessJobsCurrent(view)` before the original frozen return. Initial
admission, exact property selection, literal search, canonical row identities,
ordering, UNKNOWN holds and navigation-only meaning remain unchanged. No advanced
engine, source store, authorization cache, route, writer or preview layer is added.

## Local evidence

- Parent: **3 FAIL / 0 PASS** for this module within the two-module **6 FAIL**
  regression run. Each failure is the private-result assertion after actual native
  owner revocation. Raw SHA-256:
  `a29ed575648f414a41e8b1f7e0ff023fc06c85c23befe536dbe44d51ffe072c5`.
- Corrected new cases: **17 PASS / 0 FAIL / 0 skipped** for this module within the
  combined **34 PASS** focused run. Raw SHA-256:
  `cb65bd886f4a055544d226c639f4f2778b3d26e0e6cf8923265866efd3e469bf`.
  Cases cover actual three-brand revocation, confirmation withdrawal and retained
  UNKNOWN, ordinary original row references/frozen results, unchanged selection,
  literal search, no writes, distinct same-property jobs, property intersection,
  copied-handle denial, foreign-company denial and invalid/default-OFF admission.
- Directly affected original filters: **8 PASS / 0 FAIL / 90 filtered** from the
  unchanged Cycle16 file. The same targeted run separately passed five original
  Customer filter cases; its aggregate is **13 PASS / 151 filtered**, not a full
  164-case pass. Raw SHA-256:
  `9cd8bc839d1aab71ee2938972d563a4b6f2e5396a818738756521d163ae87d2d`.
- Strict TypeScript, scoped ESLint, Prettier and diff checks passed.

This two-module local working-tree execution is not a clean author commit or
hosted result. Original test/hook budgets remain 30 seconds, with one focused
worker and zero retries. Existing successful cohorts were not rerun; browser,
complete Foundation, physical recovery and visual acceptance remain separate.

The bounded read audit of existing Offline, Voice-to-Estimate, procurement,
receptionist handoff, Storm/Network and trade-edition paths produced no additional
demonstrated correction. Their current provider, custody, authentication, sharing,
availability and operational acceptance gaps remain open; this is not exhaustive
acceptance or add-on completion. Original engines and one-use UNKNOWN/no-replay
controls remain unchanged.

No schema, persistence, operational restoration, credentials, hosted mutation,
provider activation, financial execution, communication, dispatch, deployment or
merge is authorized. Approved designs, P1, customer14/4B, MFA/Auth, NMI and recovery
gates remain intact.

**Release 1.0 remains NOT READY / NOT AUTHORIZED.**
