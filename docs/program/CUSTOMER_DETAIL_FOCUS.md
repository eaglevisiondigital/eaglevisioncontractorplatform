# Inline customer detail keyboard focus

Opening an existing or new customer detail now focuses its existing heading on mount. The heading has `tabIndex=-1`, so keyboard users enter the inline detail context without adding a tab stop or changing its layout. The next normal Tab reaches the original Close details button.

Explicit Close details keeps its original selection clearing behavior and returns focus to the matching currently rendered customer row or New customer trigger. If a saved row is filtered out, focus returns to the current directory search. Only connected DOM nodes are focused. The original App-style company/section key unmounts the old workspace; no detached old-company node is reused.

The focus effect runs only on detail mount, after the existing current/generation lifecycle initialization. Directory reloads and typing do not refocus the heading or reset an unsaved form. No modal, Escape handling, confirmation, autosave or discard policy is added. Query, selection, customer/location/consent/note writers, one-shot creation and pending/UNKNOWN holds remain unchanged.

New browser checks reuse the existing fictional Operations and CompanyOperations fixture. They cover saved/new keyboard open-close, filtered-row fallback, dirty-form focus through a read reload, company unmount and responsive accessibility. No original accepted journey is replayed in full. These are local development checks, not physical-device, full-reference, genuine Auth or operational acceptance.

Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
