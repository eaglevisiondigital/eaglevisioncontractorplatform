# Team directory interaction parity — isolated development candidate

Exact parent: `8f9cab9a6b42c057a12f1923bf35a514abc068b1` (#510).
This candidate remains separate from the navigation/forms/dashboard composition.

The existing authorized Team view now searches loaded account IDs and recorded
access/job roles literally, combines actual access-role and active/revoked filters,
and clears only those presentation inputs. Available and filtered-empty states are
explicit. Counts describe the loaded collection; they are not company-wide employee,
subcontractor, availability or staffing totals. No names, rates, hours, assignments
or employment classifications are inferred. The existing source order is retained.

The membership, invitation creation and invitation revocation handler attributes
remain byte-identical to the parent. The existing parent tenant/section remount,
repository reads, access/module checks, verified-account/MFA requirements and
server authorization remain authoritative. Filter controls call no repository
method, create no persistence and confer no permission. Existing loading/errors
remain visible; directory rows/counts are hidden while their source is loading or
failed. Only exact current organization rows are displayed.

| Approved reference / requirement                                       | Delivered interaction                                                                                                                 | Remaining dependency / limit                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference 24, Team & Subcontractors / Employees; specification item 16 | Search, role/status intersection, loaded-result count, reset, empty state and current-company isolation in existing Team component    | Broader screenshot directory/table composition remains partial. No staff names, subcontractor directory or payroll confidentiality expansion. |
| Specification item 19, tenant switching                                | Existing tenant remount clears directory inputs and displays exact new-company accounts                                               | Synthetic browser proof is not genuine tenant/Auth/MFA acceptance.                                                                            |
| Specification responsive/keyboard requirements                         | Existing shared styles wrap controls at desktop/tablet/mobile sizes; keyboard controls and main-scoped automated accessibility checks | No protected CSS, shell or artwork change; no whole-platform visual acceptance.                                                               |

Negative-first verification used unchanged parent runtime and failed on the absent
loaded count/search interaction. Final local verification: 12 new browser cases and
three retained original settings/invitation/revocation cases PASS across desktop,
tablet and mobile. The new accessibility cases report no WCAG A/AA violations or
horizontal overflow, and observe no write or external requests. The original
three command-handler attributes were extracted through the TypeScript parser and
compared byte-for-byte. All 128 protected source hashes and five design locks /
thirteen bindings pass the original checker. Build, strict types, scoped lint,
format and feature evidence checks are recorded separately in private qualification
evidence. Full Foundation/CI and full-platform browser acceptance are not inferred.

No protected invoice/payment/Auth/SQL/checker source, App, shared CSS, repository,
schema, store, engine, adapter or operational capability is changed. Saul 2 Paul
remains first and Cunningham requires separate acceptance. Source/API qualification
does not grant hosted acceptance. All held operational/protected-source approvals
remain independent; Release 1.0 remains NO-GO. No merge, push, deployment or persistent
background execution is authorized by this candidate.
