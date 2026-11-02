# Cycle 10 · weekly crew-plan comparison

`CrewPlanReview` is an isolated, default-OFF local panel over the same admitted
`OperatingSources` used by the multi-job operating center. It creates no schedule,
assignment, property, job or capacity store and is not mounted by this package.

## Working review

The first explicit comparison loads current authorized jobs, original property
visits and assigned technicians. Staff can build up to 32 distinct exact
job/worker/visit/day proposals in each of two unsaved plans, filter displayed job
and technician, and compare recorded evidence against plans A and B. Added,
removed, changed and unchanged rows match exact source identities, never wording.
Changing any input withdraws prior confirmation and hides its prior result.

`reviewCrewPlans` calls the existing `readPortfolioScheduling` three times, for
recorded facts, plan A and plan B. The existing canonical company day-board and
crew-capacity engine validate paired times, timezone/DST, working hours, assigned
crew, original visits, overlaps, deduplication and workload. The adapter compares
those canonical outputs; it does not implement a second capacity calculator.

Civil-day minutes describe the calendar, not working availability. Proposed working
hours and proposed workload remain human inputs. Missing hours and date-only visits
stay UNKNOWN. A shorter window or missing concern never proves improvement,
physical completion or availability. Source visits do not move.

## Exact source and read boundaries

`captureOperatingSources` retains the original company, repositories, live handle
array, models, targets, issued version and eligible synthetic reviewer. Original
caller inputs are own-data, bounded, pinned and rechecked after every awaited
portfolio read, hash and final exact-board reconciliation. Duplicate row identities,
accessors/serializers, foreign/unassigned workers, invalid visit/property bindings,
stale edits and source/model replacement fail closed. An immutable SHA-256 snapshot
is a read reference, not genuine authentication, durable custody or an atomic lock.

`openCrewPlanJob` uses the exact retained canonical portfolio source navigator.
`assertCrewPlanCurrentNow` supports immediate presentation withholding;
`reconcileCrewPlans` reads only the exact retained objects and returns UNKNOWN after
missing or contradictory evidence. No retry, replacement, replay or writer is
provided. Concurrent reviews are separate optimistic read captures, not reservations.

## Presentation and verification

The scoped premium panel uses existing journey palette variables, wrapping source
identities, named comparison regions, explicit labels, focus destinations, touch
controls and mobile stacking. Global headers, locked customer/back-office design,
approved artwork and prior workflows are unchanged. Main owns route composition,
actual combined desktop/tablet/mobile testing and acceptance records.

Focused source tests cover all three approved companies, exact source navigation,
canonical shared-worker conflicts, unchanged/add/remove/modify rows, unknown hours,
wrong properties, foreign/unassigned workers, gate denials, revoked membership,
strict inputs, source edits, last-await races, concurrent read captures, frozen
snapshots, copied-object/lost-read UNKNOWN and absence of writers or authority.
Types, owned lint/format, build and integrity results are reported with the commit.

No assignment, dispatch, synchronization, sending, contract, financial, hosted,
provider, migration, deployment or merge authority is enabled. All existing
P1/recovery/NMI/MFA/customer14/4B/Netlify/protected-artifact gates remain unchanged.
Release 1.0 remains NOT READY / NOT AUTHORIZED.
