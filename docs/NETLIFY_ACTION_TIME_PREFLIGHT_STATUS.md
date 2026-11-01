# Protected Netlify draft — current preflight evidence and decision hold

**Status: NO-GO for draft creation. No execution authorization requested or given.**

## Verified read-only observations

- Repository branch: `codex/phase-1-foundation`. The old frozen
  Action D source package is NOT the current application build.
- Netlify site ID: `757117d4-e660-40f2-8076-ddd207237006`;
  name: `eaglevision-contractor-staging`;
  team ID: `6a674f7a0e2cdcc2b838db89`.
- Netlify connector reports `requiresSSOTeamLogin=true` and
  `whichProjectsRequireSSOTeamLogin=all`. This is **connector evidence only**,
  not an independently witnessed dashboard protection configuration.
- Original deploy `6ad21fa5d00779389b042b97` belongs to that site and
  remains `uploading`, `deploy-preview`, manual, no build ID and with null
  `published_at`. It was created October 16, 2026.
- The connector's `currentDeploy` is an empty object. This does **not** prove
  that the production primary is null, nor identify a published deployment.
- The original deploy's later `required` and `required_functions` arrays
  are empty; they are **not** substitutes for initial create-response lists.

No hosted mutation, secret/environment-value lookup, deployment creation,
publication, deletion, upload or configuration change was performed.

## Additional local preparation

`server/netlify/read-only-evidence.ts` records the limited site/original
connector evidence without constructing an executable Snapshot.
`server/netlify/read-only-inventory.ts` now has a bounded GET-only
site-deployment pagination collector. The collector accepts an injected
read-only port, refuses malformed/foreign/duplicate/truncated pages, retains
only the executor's narrow deploy fields, and has **no** credentials, HTTP
handler, request implementation, write method or run command. Local tests
are not live inventory evidence.

## Required before even requesting exact A–D execution approval

1. Independently inspect **Project configuration → General → Visitor access**
   on `https://app.netlify.com/projects/eaglevision-contractor-staging`.
   Confirm Private production AND Private previews, or team login applied to
   **all** deploys. Retain time and sanitized witness evidence. If blank,
   inaccessible or contradictory, STOP.
2. Obtain a complete, current, site-scoped paginated deploy inventory and
   independently identify the current published primary (including an
   explicitly verified null if none). Verify that the original uploading
   deploy is preserved and that no unreviewed other deploy exists.
3. Read-only verify current site/team identity, no unexpected custom domains
   or aliases, Git linkage/build settings and complete **key metadata only**
   for site and shared environment variables. Do not retrieve secret values
   during preflight.
4. Review real read-only/limited write transport, exact target protection,
   bounded operation supervision, immutable private custody and abort wiring.
   Offline test adapter outputs or guessed environment values are insufficient.
5. Only after all checks pass, prepare a **new target/code/preflight-hash-bound**
   owner A–D authorization request using
   `docs/NETLIFY_REPLACEMENT_DRAFT_REVIEW.md`. Do not infer authorization
   from the old P1 approval or from these read-only observations.

The accepted strategy remains one protected unpublished manual replacement
draft built from the sealed original `28c7d5e` package, **not** current PR
source. The frozen body/package/target hashes and four Functions must stay
unchanged. Never replay the final manifest or attempt a same-ID repair.
A successful unpublished draft would not authorize production launch.

**Current decision: HOLD / NO-GO.** Independent dashboard witness, complete
inventory, primary state, metadata, real adapters, manual supervision and
specific owner approval remain open. Do not commence the provider's timed
upload window.

All historical migrations, customer fourteen, 4B/broker proposals, frozen P1
approvals/artifacts, Netlify original archive and Release 1.0 restrictions
remain preserved. Release 1.0: NOT READY / NOT AUTHORIZED.
