# Explicit workspace reload after a read error

The existing Phase 3 workspace displays access, module and initialization read errors. It now offers **Reload estimating workspace** only after a completed error. The button invokes the existing resource reload callback. It disappears during loading and when the workspace is ready.

The loader and its original access, module, company and repository checks are unchanged. Reload is an explicit new read attempt, not permission, an automatic retry or a financial command. A disabled module and denied estimating access stay closed. Late results from an old company cannot replace the current workspace through the existing resource lifecycle fence.

The production repository initialization remains unchanged. In the fictional sample repository, initialization retains the original per-company promise, including rejection. Reloading an initialization failure does not clear that promise, reseed data or release an UNKNOWN hold. A successful original sample initialization creates one original fictional example; this is distinguished from a user-created draft in the test counts.

The isolated browser fixture uses the existing sample Operations and Phase3Repository. It changes only finite read results and records calls; no connected request, financial operation, message, provider or database is invoked. Tests cover explicit loading, current denials, retained failed initialization, late company reads, no added automatic reload and a named keyboard button on three emulated viewport profiles. Viewport coverage does not establish a physical device result.

The source map of customer → estimate → job remains separate from invoice and payment capabilities. The existing App has no commercial invoice/customer receipt/payment route. Internal estimate issuance and job baseline approval do not establish genuine customer contract approval, invoice delivery or payment. No separate financial proposal is composed here.

Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
