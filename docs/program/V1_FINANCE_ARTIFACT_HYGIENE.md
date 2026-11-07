# Finance screenshot artifact hygiene

This separate source-only package starts from frozen Main306,
`337da476aa6061dba626aff343f0e6045331ac82`. It appends only
`/artifacts/finance/*.png` to the original ignore bytes, adds isolated Git-rule
controls and a dedicated controls-only workflow. Main306 and drafts303–305 remain
unchanged. No application or original browser test is modified or executed here.

## Demonstrated source gap and historical limit

Both original305 fixed523 default-browser jobs reported399 PASS, zero failures,
flaky results or skips across32 files/six projects, then failed their final clean
binder. These are separate outcomes; the browser assertions remain successful and
the clean binding remains failed.

The unchanged `tests/browser/job-margin.spec.ts` unconditionally awaits four
Finance screenshot templates: `job-margin`, `job-margin-warnings`,
`job-cost-completion` and the panel `job-cost-completion-detail`. Each writes a
root `artifacts/finance/*.png` name. Exact523 and337 ignore files have no matching
Finance PNG rule. The original disposable Git fixture reproduces that omission.

The historical Finance directory was not uploaded. No complete actual dirty-file
inventory or post-job tracked-source comparison is available. Thus this source gap
is a plausible contributor, not an established exclusive cause of the historical
binder failure. Post-job tracked-source state remains UNKNOWN. This change does not
repair or retroactively accept either binder, and it never reruns the399 browser
assertions to inflate coverage.

## Exact name scope, not a security boundary

The leading slash anchors the rule to the repository root. Its single `*` does not
cross a slash. Ordinary nested Finance PNGs, another directory, application source,
JSON, SVG, PDF and `.png.json` files stay visible to Git. Existing tracked bytes,
source checks and protected hashes remain the actual source protection.

Git ignore rules match names, not validated file types. A root PNG-named symlink
matches without protecting its target. A PNG-named directory and its descendants
also match, including a descendant JSON name. Git rejects traversal through a
directory symlink for ignore evidence. The controls characterize these limits;
there is no new directory negation, file-type fence or secret-storage permission.
Artifacts never confer authority or become executable application code.

## Bounded controls and evidence

The new Node test reads the actual original screenshot source and copies the actual
ignore bytes into one disposable Git repository. It verifies all four emitted name
families, eight unrelated/nested/non-PNG denials and three symlink/directory
characterizations. Global/system ignore configuration is excluded. All temporary
data is synthetic and removed; no recovery folder or existing evidence is read.

There are17 source-only cases, one test worker, no retries and unchanged30-second
per-case/file budgets. Parent-source RED reports10 PASS /7 expected FAIL. Corrected
source reports17 PASS /0 FAIL. A formatting-only repeat preserves the same17 case
identities; it is not34 distinct cases. Exact raw hashes are retained with the
private author freeze.
No app/native business/browser suites are run. The added workflow installs no npm
dependencies and runs only these controls. It records exact candidate/checkout tree,
Git root, clean state and every tracked byte before/final, including the actual
single-parent337 author or its exact same-tree PR carrier. Its result cannot certify
the historical523/305 run or a full Foundation/browser suite.

No source manifest, old test, dependency pin, UI/style/artwork, schema, business
engine, provider adapter, financial execution or recovery record changes. The five
locked files, thirteen bindings and128 protected files remain unchanged. D1 people
remain UNASSIGNED, D2/D3 separate, A01–A12 NOT_RUN. Original November4 main synthetic
loss PASS only and duplicate UNKNOWN/private folders remain preserved.
Release1.0 remains **NOT READY / NOT AUTHORIZED**. No hosted mutation, operational
restore, payment, message, dispatch, merge or deployment is authorized.
