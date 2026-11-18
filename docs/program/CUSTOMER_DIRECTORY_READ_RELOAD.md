# Customer-directory read recovery

A failed customer-directory read previously displayed **No customers match this view** and had no direct reload action. The existing empty-state message, record count and pagination now require completed successful data. A completed error offers **Reload customer directory**, invoking the existing resource reload callback; the action disappears while loading and after success.

The original query callback and search/type/page state are unchanged. Reload reads the current query without creating or updating a customer. CompanyOperations keeps its existing role/module gates and the App-style company/section key boundary. A late old query or old-company read may finish, but the existing resource lifecycle prevents it from replacing the current view. This does not add authority checks to arbitrary direct component replacement or claim genuine hosted Auth acceptance.

Customer detail, locations, consent, notes and all writer bodies remain unchanged. The existing one-shot customer creation and pending/UNKNOWN holds are untouched: a directory row is not a transaction receipt, and read reload does not authorize command retry, replacement or hold reset.

The isolated fixture uses the actual CompanyOperations and original fictional sample Operations. It adds no customer records, store, schema, route or connected capability. New browser checks cover explicit loading/recovery, current filters, genuine empty reads, late query/company completion, parent gates/backend denial, saved-record opening, keyboard operation and accessibility on desktop/mobile viewport profiles. These are local development checks, not physical-device or all-63-reference acceptance.

The commercial invoice/customer receipt/payment routes remain unmounted or disabled. Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
