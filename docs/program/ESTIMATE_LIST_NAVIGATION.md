# Existing estimate review navigation

This isolated ordinary UI child of the issuance-reference candidate finishes the
existing estimate-list review flow. Search, status and page remain in the original
component state. Explicit opening captures the exact loaded estimate and version,
checks current estimating access and module state before and after the read, and
rejects changed list, company, repository or filter context. Foreign, duplicate and
mismatched source records remain unavailable. Errors expose no raw reader details.

Keyboard opening focuses the existing editor heading. Returning with All estimates
reloads the existing list and restores focus to the same visible record. If that
record is absent, focus returns to search; no other estimate is opened. A shorter
list clamps its displayed page. Counts describe only loaded records, which may be
limited by the repository. Refresh estimates performs existing read operations;
it never selects a replacement source, retries a writer or clears an UNKNOWN hold.

All existing editor writer calls, calculation rules, immutable versions, issuance,
job approval, revision and CAS protections remain authoritative. This is a
point-in-time read and presentation fence, not continuous authentication or an
atomic server revision check. Caller-supplied initial-bundle workflows retain
their existing authority requirements. Genuine Auth/MFA and hosted data acceptance
remain separate gates.

Approved references 6 and 38 are partial interaction targets only. This work does
not implement their complete visual shell, financial KPIs, customer approval,
delivery or payment behavior. The original 63 reference identities and hashes
remain in the existing private traceability matrix; no full state is accepted.
The optional candidate is not composed into the protected financial source.

Focused browser coverage exercises keyboard/focus return, filtering and paging,
shrinking results, denied access, module withdrawal, malformed sources, delayed
reads and company/repository replacement with external requests intercepted.
Validation results are recorded in the PR. No credentials, provider calls, hosted
SQL/grants, messages, recovery, merge or deployment are part of this change.
Release 1.0 remains **NO-GO / NOT READY / NOT AUTHORIZED**.
