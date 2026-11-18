# Loaded estimate filter reset

The Estimates list has one explicit **Clear estimate filters** action. It clears
only the current search text, status filter and list page, showing the first page
of records already loaded for the current company. The action is disabled when
those controls are at their defaults.

The existing explicit customer choice for a new draft stays selected. Clearing
filters neither creates a draft nor reads an estimate. Existing current-source,
company, permission and row-opening checks remain authoritative; clearing filters
does not reload or restore a denied resource. The entire editor and all repository
calls are unchanged. The list is a loaded subset, not a complete company history.

This ordinary increment is a child of reviewed UI #584 and reuses the unchanged
existing-engine estimate-navigation fixture. New desktop, tablet and mobile
browser cases cover the reset, pagination, explicit customer choice, guarded saved
record opening, current-company records and denied-resource behavior. Synthetic
fixtures and viewport profiles do not establish operational or physical-device
acceptance. Separate commercial branches and disabled delivery/payment authority
are not composed. All 63 reference IDs and classifications remain unchanged;
related source evidence remains partial. Release 1.0 is not ready or authorized.
