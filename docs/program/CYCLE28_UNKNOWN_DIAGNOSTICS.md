# Cycle 28 · truthful offline ambiguity diagnostics

Author: `/root/cycle28_customer_offline`. Exact sole source parent:
`5f74b8ff5385560330cb94717c17338ed0c10f44`.
Branch: `codex/cycle28-unknown-diagnostics`. This changes the existing stateless
read-only reconciler, not the original comparison or any custody/command owner.

The native baseline reproduced two finite diagnostic defects. A protocol that became
malformed while the existing asynchronous native reader was running was labelled
`EXACT_BINDING_OR_LIVE_PROTOCOL_UNVERIFIED`, although parsing had failed before a
source comparison. Withdrawal of the original local gate during that read was labelled
capture-currentness uncertainty, even though local admission was no longer present.
The new 25-case source suite recorded 7 passes and 18 failures against the unchanged
parent. These are diagnostic assertion failures, not evidence of executed offline work.

The original parser now validates the live proposal under `EXTERNAL_PROTOCOL_INVALID`
before finite mismatch calculation. Any malformed live envelope remains UNKNOWN and
contains no stale mismatch array or untrusted values. A valid changed envelope retains
the original `live_protocol` mismatch. Before returning an unavailable native capture,
the existing local gate is checked again; withdrawal returns
`LOCAL_REVIEW_NOT_ADMITTED`. Current original owner/source checks and their independent
holds are unchanged. An authorized source-change observation retains its original
finite diagnosis; no missing evidence is classified as failed execution.

The corrected 25 new tests and 87 retained C24/C26/C27 cases pass together: **112/112**.
All three existing brands exercise accessor, missing/extra field, negative revision,
invalid digest, mid-read gate withdrawal, revoked owner precedence and exact read-only
reconciliation after invalid input. Tests assert no getter execution, source writes,
hashing/preparation, replacement, replay, durable receipt or operational readiness.
The separate unchanged C25 advanced-source admission suite also passes **37/37**;
this is retained coverage, not 37 new cases. Raw RED/GREEN JSON is retained privately under `artifacts/cycle28`; raw correspondence
or credentials are not included. Strict types and scoped ESLint pass.

The existing C27 eight canonical plus four native mismatch fields, original parser,
claim ownership and successful result shape are preserved. No UI, route, business
store, evidence registry, schema, restoration adapter, synchronization worker or
network mutator is added. This is same-tab local review, not process-crash durability,
actual synchronization, an execution receipt or genuine authenticated acceptance.
The original 25 recovery checks were not repeated. Danny's Air is last unavailable;
physical rehearsal remains NOT RUN. P1/customer14/4B, Auth/MFA, NMI, Netlify/recovery,
financial, communication, dispatch and production gates remain unchanged.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
