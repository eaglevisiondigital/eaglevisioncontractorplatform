# Voice-to-Estimate — literal synthetic transcript review

Assignment 9; isolated `codex/program-voice-estimate` from reviewed boundary
`083b3230f81b67cc9abbe6c7dd6a982799c99408` plus Main's unchanged final checkpoint
`d53a902`. Owns only this document, `src/lib/program/voice-estimate.ts` and its
focused test. No application route, estimating engine, design or schema changes.

`prepareVoiceEstimate` accepts a bounded synthetic transcript only after explicit
live enabled/confirmed review and actual admitted tenant/customer/property/version
source. Each semicolon/newline-separated literal clause uses an explicit decimal
quantity, canonical estimate unit and exact active catalog name, such as
`2 hour Exact existing catalog name`. Output retains UTF-16 literal span offsets,
exact catalog candidate IDs and typed existing `EstimateLine` field suggestions.
Quantity uses existing milli-unit representation. No price, markup, tax, total or
financial calculation is invented. Suggestions must be manually reviewed and entered
through the existing editor; no estimate or line ID is created.

Unknown wording, invalid quantities, wrong units, absent exact names and duplicate
catalog names produce distinct warnings. Ambiguous candidates stay separate. Similar
wording, unit conversion or a transcript instruction never silently selects a source.
Descriptions and kinds come from actual authorized catalog metadata. The transcript
is untrusted text, never code, a command or authorization.

There is no microphone, audio capture, speech-recognition API, AI model, network
call or provider. This intentionally makes no on-device transcription claim. MDN
notes that local SpeechRecognition processing is experimental and its default may
permit local or remote processing; any future audio integration needs separate
review before activation ([MDN processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)).

An immutable SHA snapshot retains exact source and saved revision. Before returning
or declaring CURRENT, the existing binding and synchronous source checkpoint validate
current member/source/original confirmation plus this package's live confirmation.
One session-only exact-target hold prevents duplicate, concurrent, recaptured-source
or UNKNOWN replacement; exact read-only inspection never retries a command. Stale or
denied reads reject and retain the old snapshot. No refresh/crash durability, genuine
Auth or custody is claimed. No issue, save, customer delivery, finance or authority.

Focused tests use all three actual sample company fixtures, exact typed material/labor
catalog metadata, ambiguity, unmatched and malformed text, canonical units/quantity,
source privacy, immutability, concurrency, member/source rejection, withdrawal and real
source edits across hash/consumer boundaries. Run
`npx vitest run tests/program-voice-estimate.test.ts tests/program-prototype-source.test.ts`.
This unwired domain prototype has no UI/browser acceptance claim. Every existing
release, recovery, NMI, migration, financial, hosted, communication, deploy and merge
gate remains intact. Release 1.0 NOT READY / NOT AUTHORIZED.
