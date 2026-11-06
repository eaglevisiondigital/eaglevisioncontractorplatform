# Published history filtering currentness

Reviewed parent: `8c0286e0e70133c8e0a0e0e478e89a3a6b8ddf55`.

The original published-service filter checked its retained native history before
capturing caller filter fields. A descriptor Proxy could revoke the actual native
owner during capture, then receive private published reports even though the
original reader independently rejected the revoked owner. All three contractor
brands reproduce this exact disclosure on unchanged parent runtime bytes.

The existing filter now retains its computed original rows locally, invokes the
same original `binding(view)` check again, and returns those rows. Initial
admission, strict own-data filter validation, literal text, same-finding severity,
exact report references, ordering and existing terminal UNKNOWN custody are
unchanged. No new reader, state store, authorization cache, writer or UI is added.

## Local evidence

- Parent: **3 FAIL / 0 PASS** for this module within the two-module **6 FAIL**
  regression run. Each failure is the private-result assertion after actual native
  owner revocation. Raw SHA-256:
  `a29ed575648f414a41e8b1f7e0ff023fc06c85c23befe536dbe44d51ffe072c5`.
- Corrected new cases: **17 PASS / 0 FAIL / 0 skipped** for this module within the
  combined **34 PASS** focused run. Raw SHA-256:
  `cb65bd886f4a055544d226c639f4f2778b3d26e0e6cf8923265866efd3e469bf`.
  Cases cover actual three-brand revocation, confirmation withdrawal and retained
  UNKNOWN after restoration, original row identity, literal filtering, accessor
  rejection without invocation, no writes, allowed native plan changes with
  immutable published history, copied-handle denial, foreign-company IDs and
  original invalid/default-OFF admission.
- Directly affected original filters: **5 PASS / 0 FAIL / 61 filtered** from the
  unchanged Cycle21 file. The same targeted run separately passed eight original
  Advanced filter cases; its aggregate is **13 PASS / 151 filtered**, not a full
  164-case pass. Raw SHA-256:
  `9cd8bc839d1aab71ee2938972d563a4b6f2e5396a818738756521d163ae87d2d`.
- Strict TypeScript, scoped ESLint, Prettier and diff checks passed.

The two-module working-tree execution is local source evidence, not a clean author
commit or hosted result. Original test/hook budgets remain 30 seconds, with one
focused worker and zero retries. No existing successful cohort was rerun. Browser,
complete Foundation, physical recovery and visual acceptance remain separate.

The original missing request-to-job relationship stays UNKNOWN; published service
documentation does not infer physical completion, customer acceptance or delivery.
Existing source custody and navigation remain unchanged. No schema, persistence,
restoration adapter, credentials, hosted mutation, provider activation, financial
execution, communication, dispatch, deployment or merge is authorized. Protected
designs, P1, customer14/4B, MFA/Auth, NMI and recovery gates remain intact.

**Release 1.0 remains NOT READY / NOT AUTHORIZED.**
