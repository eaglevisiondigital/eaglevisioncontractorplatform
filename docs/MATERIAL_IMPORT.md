# Smart Material Import · implementation and activation boundary

## Implemented locally

Review multiple synthetic supplier PDF/photo extractions; retain vendor, dates,
SKU, raw strings, page/sheet/cell references, warnings and model confidence. Correct
canonical quantities/units/costs, compare arithmetic independently, acknowledge
uncertainty, select rows and approve itemized or lump-sum materials. Company,
supplier and row markup precedence is explicit; underlying costs remain private.
Receipt review reuses this engine, posts per-supplier rows as pending expenses,
and supports manual budget matching. Purchase receipts never authorize billing.

`server/materials/pipeline.ts` defines quarantine storage, approved scanner, full
content validator and extraction-provider contracts. It checks limits, digest/path,
current clean scan and full validation before release/extraction. An HTTPS-only
extraction gateway adapter sends inert document data with no tool execution and
validates a provider-neutral schema. A bounded literal CSV parser/extractor supports
`docs/SUPPLIER_IMPORT_TEMPLATE.csv`; it rejects malformed UTF-8/quotes/headers/rows
and never evaluates spreadsheet formulas. Numeric formulas stay uncertain values.

Pinned server validators fully decode bounded single-frame JPEG/PNG/WebP images and parse bounded PDFs, rejecting truncation, encryption, active actions and embedded content. Synthetic real-byte tests exercise these parsers. They must still run in a resource-limited isolated worker.

No live AI/scanner call has been made. No real source passed production scanning.
The Netlify ingestion function returns 503 unconditionally. The file/camera picker
only lists selected local filenames. Synthetic fixtures are explicit, in memory,
and cannot make a connected issued estimate. Credentials alone do not enable the
endpoint; its isolated worker/storage implementation must first be completed and
validated. Existing document upload restrictions are unchanged.

## Provider comparison · official documentation reviewed October 15, 2026

| Candidate                                                                                                                                      | Relevant documented capability                                                            | Fit and evaluation needed (engineering assessment)                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Azure Document Intelligence](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/invoice?view=doc-intel-4.0.0) | Invoice-oriented OCR/structured line items from images and PDFs, including phone captures | Strong benchmark candidate for receipts/invoices. Supplier quotations and unusual trade units need a representative test corpus; map output to the shared schema. |
| [Google Document AI](https://docs.cloud.google.com/document-ai/docs/processors-list)                                                           | Specialized document processors, including invoice and expense parsing                    | Compare line-item recall, locale coverage, regional processing and custom quotation layouts. Preserve source evidence independently of processor field names.     |
| [Claude PDF/vision](https://platform.claude.com/docs/en/build-with-claude/pdf-support)                                                         | PDF text and visual document analysis                                                     | Candidate for irregular screenshots/quotations. Require literal nullable prices and a constrained gateway response; model confidence is not calibrated accuracy.  |

These are candidates, not purchased services or validated adapters. Benchmark
synthetic/redacted supplier documents with exact quantity/unit/cost recall,
missing-value behavior, source fidelity, duplication and prompt-injection attempts.
Compare latency/cost, region/retention, data-use terms and operational controls
before selecting a vendor/model. No provider-specific schema enters tenant tables.

## Required isolated worker work before real ingestion

1. Approve a disposable Supabase/Netlify environment and migration run. Provision
   separate private quarantine/clean storage and least-privilege worker identity.
   Never put a service-role key in a browser or generic request-scoped endpoint.
2. Implement authenticated streaming ingestion: current tenant/estimating permission,
   server-resolved object path, maximum 10 files/3 MiB each/200 review lines, resource
   quotas, actual hashes, type signatures, idempotent source creation and safe retry.
   Purchase sources must be bound to an assigned job; no document URL fetching.
3. Integrate an approved malware service/engine with authenticated evidence,
   current signatures, digest match, timeouts and failure quarantine. No “clean”
   default, fixture-mode flag, client-supplied verdict or public signed upload bypass.
4. Run the implemented image/PDF/CSV validators in a resource-limited sandbox.
   Local parser tests do not validate worker isolation, malware coverage or all
   resource-bomb variants. Retain page/object/pixel/time limits and dependency review.
   XLSX is explicitly unsupported until its ZIP/XML/macros/formula limits are audited.
5. Implement atomic scoped store transitions, scan evidence/provider metadata,
   immutable approved-source behavior, retention/purge and orphan cleanup. Store
   original clean bytes privately; strip image metadata from any normalized AI copy.
   Staff file access must remain unavailable before both scan and full validation.
6. Configure the approved HTTPS extraction gateway URL/model/token in server-only
   secret storage; verify real output against the neutral schema. Add durable jobs,
   bounded retries and explicit errors, not success-shaped mock responses.
7. Test actual Storage HTTP denial and worker failure cases in isolation. Recheck
   RLS/advisors, source integrity, corruption, malicious content, tenant revocation,
   extraction uncertainty and concurrency. Record evidence before activation review.

The gateway adapter constructor accepts URL/model/token; no environment switch or
production worker is currently wired. No real configuration is assumed to exist.
