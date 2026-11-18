# Start a private estimate for an explicit customer

This ordinary child of #574 replaces the implicit first-loaded-customer default
with a required, explicit choice from the company customer records already loaded
by Estimates. The same choice is used for a blank estimate or an existing company
template. The selector is a loaded subset, not a complete customer catalog or an
authorization grant. An empty customer list remains valid: existing estimates or
the honest empty state remain accessible, while creation requires a choice. Sparse,
duplicate, invalid or foreign loaded customer rows deny the resource as a whole
before list rendering or creation. The original
10-row customer-page limit is retained. Changing the choice itself performs no
read or write.

The original blank/template input is built synchronously from the click-bound
source before the new awaits; later in-place default/template drift cannot
replace those clicked values. Starting a draft adds UI preflight calls to the existing exact customer reader
and current estimate-permission check. The exact selected ID is captured before
awaiting. Selection, repository/company and resource tokens are checked after each
await and immediately before the existing create call; the loaded and freshly read
customer identity must still match. A refresh clears the choice synchronously,
including when the same ID returns in fresh data. Removed, changed or unavailable
customers fail with a generic message and no draft dispatch. No first-record or
alternate-customer fallback remains.

The existing repository/server create, save, issue, CAS and UNKNOWN behavior is
unchanged. Once create is dispatched, the existing immutable outcome handling
remains authoritative; UI withdrawal cannot cancel that operation or authorize a
new-ID replacement. The existing editor-heading focus is reused after successful
creation. Existing estimate opening and the complete editor remain unchanged;
loaded resources additionally reject malformed customer lists before rendering.
No API, schema, store, calculator, connection or Auth mechanism is added.

The before-image case demonstrates that New estimate was enabled with no customer
choice. Focused fictional existing-engine checks cover explicit nonfirst selection,
template input, invalid/stale/foreign records, held preflight context changes,
current permission withdrawal, the original dispatched outcome, keyboard/Axe and
responsive rendering. Existing accepted suites are retained without broad replay.

References 6 and 38 remain partial. The private-draft customer workflow does not
accept their full dark-shell proposal, approval, financial or customer-delivery
states. Existing 63-reference IDs/hashes/history, 128 protected files, five locked
files, thirteen bindings, helper531 and all operational gates remain unchanged.
Release 1.0 remains NOT READY / NOT AUTHORIZED.
