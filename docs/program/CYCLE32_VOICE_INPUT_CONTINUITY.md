# Cycle32 · original confirmed Voice-to-Estimate transcript continuity

Parent: `43e622b16aa952f5dc2fe7ae9f96260b47682c2e` (draft233).

## Demonstrated native consumer defect and correction

The existing local `prepareVoiceEstimate` captured literal transcript text before
awaiting canonical source validation. An ordinary caller-owned form could change
while source validation or snapshot hashing finished, yet the original consumer
returned a packet for the earlier text. Its exact read also returned CURRENT after
the retained original form changed. These failures are specific to the direct
native Voice-to-Estimate consumer. Existing outer add-on facades can independently
pin their own input; this record does not claim every UI path exposed the defect.

The existing parser, exact catalog/unit matching, literal UTF-16 spans, canonical
source checks and immutable packet stay authoritative. One private closure retains
the original input and confirmed literal. Preparation checks both current local
confirmation and that original literal after each source/hash await and after the
final synchronous source check. Exact inspection checks that same original input
before and after its own hash/source awaits. No packet fields or source projection
are widened, and no transcript is reparsed into a second estimate engine.

The original same-session one-use hold remains in its original position before
snapshot hashing. Denial after that hold cannot prepare a replacement, including
through a recaptured source. A changed form detected at the first source read is
rejected before the original hold; that read never claims a preparation attempt.
Immutable prior packet contents remain unchanged. This adds no operational writer,
restoration adapter, durability claim or customer approval.

## Reproducible evidence

Run the original pinned Vitest configuration, four workers and unchanged30second
case/hook budgets:

```sh
./node_modules/.bin/vitest run tests/cycle32-voice-input-continuity.test.ts tests/program-voice-estimate.test.ts --reporter=json --outputFile=artifacts/cycle32/voice-green.json
```

New21cases exercise all three contractor brands: ordinary input changes after the
first and last actual source validations, changes while the real packet digest
finishes, later retained-form edits, changes during inspection hash/source checks,
and unchanged literal offsets/catalog identity/privacy/immutable/no-write behavior.
Spies wrap actual source validation/digest calls; source/packet construction is not
mocked. The original fixture uses actual existing Operations and Phase3Repository.

- Exact parent RED:21cases,3PASS/18FAIL,0skip. All18failing cases resolved a stale
  packet or CURRENT result rather than rejecting the changed confirmed input.
  Ignored raw `artifacts/cycle32/voice-red.json` SHA256
  `a0f72d1a355d8e8f26f6d29f362d3ea700d43e2201fd658041b00f0c1ce38a4c`.
- Corrected GREEN:41/41PASS,0skip:21new and20retained native Voice cases. Ignored raw
  `artifacts/cycle32/voice-green.json` SHA256
  `27d4e2da909b4d3d3b99aae524395cd7212ceaa9d763d0f35b383e6b87194811`.
- Strict TypeScript and focused ESLint PASS. No retained test, assertion, fixture,
  configuration or time budget was modified. Main independently handles composed
  source admission, browser integration, protected integrity and actual-head CI.

No UI/CSS/artwork, transcript recognition, microphone, automatic editor save,
issuance, payment, communication, live provider or hosted operation was enabled.
The original local admission and private current owner/admin source authority
remain required. Protected migrations, P1/four artifacts, customer14/4B, Netlify,
recovery, NMI/Auth/MFA and financial/release gates remain unchanged.
Release1.0 remains NOT READY / NOT AUTHORIZED.
