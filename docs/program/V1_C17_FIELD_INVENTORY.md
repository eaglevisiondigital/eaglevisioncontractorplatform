# C17 inventory recognizes the exact reviewed Field successor

This isolated source-test correction starts from draft306's frozen
`337da476aa6061dba626aff343f0e6045331ac82`. It changes only the original
`tests/cycle17-integration.test.ts` and this note. Its predecessor test SHA256 is
`6e68a895ce33c1bcda2ffb5a660aa27f9abf0f89a33c12439c9baf6a31a74589`.
No application, CLI, source manifest/pin, shared contract or workflow changes.

## Actual failure and bounded correction

The original combined admission case hashes all thirty C17 current files against
the original six packages of five files. On exact306 its single failure is the
raw Field hash comparison: reviewed native `76659989...` differs from original
`682306378...`. The actual C17 integrity CLI already admits this exact successor;
this separate direct test consumer had not composed that existing admission.

The same case retains six packages, five files each, thirty unique paths and the
original raw hash equality assertion for all twenty-nine other files. It always
requires Field's original literal metadata hash
`682306378cd16d8cde94ab153633b1621f44d3696d6f7b2743e57d33116f97f8`
and publisher `23829f2995b113eb5426b0a5328e12624efd3be5` before any equality or
successor branch. Original Field bytes still use the raw equality assertion.

Only a mismatch at exact `src/lib/workflows/field-workspace.ts` calls the existing
`admitNextFieldPublished(f, current, p.head_commit)` with actual file/Git reads and
no supplied/mocked ports. Its receipt must exactly identify source commit
`94556e2a213bb513264432aa48e97bd3a94184d2`, module `field-navigation-ack`, authority
`SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE`, business authority false and restore
adapter false. Other mismatches continue to fail raw equality.

That unchanged helper verifies the historical original Git object/hash, original
publisher/parent, sole523 author, exact M1/A2 author delta, regular source modes,
complete current author bundle, immutable original companions and final fresh
reads. No historical hash is replaced, unknown successor admitted or check skipped.

## Actual evidence and remaining admission dependency

The retained hosted RED is exact306 C17 PR run42399640119, job128484419455,
artifact13585028272. Provider ZIP SHA256 is
`43294700e8f0c158a5e418947ca31542f03a86fbf69fc5e8059bd1de30b7ba7d`;
raw report SHA256 is
`0899dd9db2daecd86e9c292c27c3e437d2259d46e7f8c23d2ea99598b2b069bb`.
Its actual collection is479PASS/1FAIL/0skip across480 cases, twelve physical file
records and fourteen reported suites. The sole13.87ms failure is this exact hash
assertion, not a deadline or demonstrated runtime defect. No parent or479 successful
cases are rerun locally.

After the stronger metadata checks, only this original case runs locally:
1PASS/0FAIL/44unselected,499.78ms, original30-second test/hook budgets, maximum two
workers and retry0. Raw SHA256:
`7f3077ae4870db9db92a35bbf56c160525fd1a07734149a7911a4b163ae48c8c`.
An earlier one-worker execution before the additional explicit publisher assertion
also passed the same case; it remains separate diagnostic evidence, not another
distinct case or a full45PASS run. The other forty-four case bodies are unchanged.

Strict types, scoped lint, formatting and feature/protected checks pass. This
modified test itself is a retained C17 source. Its original pin and previous
admissions remain unchanged here, so Main must separately review and admit this
exact M1/A1 author before the complete C17 checker can accept the new test bytes.
This focused result is not green whole C17, Foundation or new-head CI. Draft306's
own exact337 sources and dedicated139 native/18DEV/3OFF successes remain separate;
this unintegrated child cannot revise their original outcomes or broader failures.

All128 protected sources, five design locks, thirteen bindings and25 original
acceptance records remain unchanged. Eleven D1 roles remain UNASSIGNED; D2/D3 stay
separate and A01–A12 NOT_RUN. November4 retains owner-witnessed main synthetic loss
PASS only; duplicate recovery remains UNKNOWN/UNVERIFIED with both private folders
and consumed attempts untouched. No source evidence restores business authority.
No operational Auth, financial, communication, dispatch, hosted mutation, recovery,
merge or deployment permission. **Release1.0 NOT READY / NOT AUTHORIZED.**
