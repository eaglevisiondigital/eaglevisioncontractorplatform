# Selected estimate CRM details

This isolated child of #562 adds a collapsed business-contact and full postal
address view inside the existing estimate CRM picker. It uses the exact selected
objects already read by that picker. Opening the details performs no additional
repository or Auth reads. It adds no writer, route or customer/invoice authority.

Customer and property identities remain internal. The view shows name, email,
phone, customer type and postal address; no raw IDs, private notes or financial
facts are displayed. Missing address strings remain valid existing records and
render as partial addresses or “Not recorded,” without inventing data. Current
CRM details remain distinct from an issued estimate’s retained snapshots.

The existing resource now carries the Operations/organization identity as well
as query and exact selected IDs. Replacing Operations hides old options and
details in the same committed render, before loading effects run. Tenant and
customer/property relationships, page identity conflicts and malformed responses
deny the whole presentation with a generic error. These are checks over existing
authorized reader results, not new Auth verification or continuous revocation
monitoring. Search, paging, selected-ID callbacks and editor command/CAS/UNKNOWN
controls retain their original ownership and behavior.

Reference 34 remains the original Leads & CRM Contact & Property screenshot.
This Estimates-picker addition advances that business-disambiguation intent in
a different existing destination; it does not rename the reference, replace the
#557 Jobs overlay or establish its full CRM layout/state acceptance. Dark-shell,
KPI, timeline and action differences remain. The existing 63-reference history,
#555/#557/#562 behavior, 128 protected sources, five locked files and thirteen
design bindings stay intact. Optional UI source is not launch promotion or
operational acceptance.
