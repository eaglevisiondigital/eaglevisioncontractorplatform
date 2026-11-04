# Cycle 29 · exact published-review keyboard continuity

Author: `/root/cycle28_customer_offline`. Exact sole parent:
`067b08b1c3f2e2e2bd259639c636eb13a2c079d4`.
Branch: `codex/cycle29-service-continuity`.

After **Inspect original published evidence**, the old handler focused the intake
heading while the selected report was still being committed. The exact document was
visible, but keyboard focus jumped above the published-source list. All three actual
desktop brand cases reproduced the unfocused report heading against the unchanged
parent. The existing C28 initial-load focus was correct and is preserved.

The original component now focuses the exact inspected report's own heading after
commit. A layout effect is tied to the existing report/view/request/evidence handles;
it calls the original current-source/current-access inspector before focusing. The
heading is programmatically focusable; no CSS, artwork, source parser, navigation,
store, timer or action owner changes. The old report handler's intake-focus call is
removed. Changes to form controls do not renew either loaded-source focus effect.
Stale/revoked sources continue withholding the report and cannot gain focus.

Nine actual native React/Vite/browser cases pass across the three brands and desktop,
tablet and mobile, with no skips or retries. They retain C28 first-load heading focus,
use real keyboard Enter for exact report inspection, assert the committed report focus
and preserve the explicit absent request→job FK warning. Revoking the original actor
through the native synthetic control-plane API withholds both intake and report detail.
Nine screenshots and separate baseline/current JSON remain private in
`artifacts/cycle29/customer-report-focus`. Main records the exact committed byte match;
these local tests are not GitHub CI, visual approval, genuine Auth or physical recovery.

Six new source-based cases pass on all three brands. A known closed intake and a lost
native intake acknowledgment each retain authorized exact published report/history
reads. The former remains KNOWN_SAVED, the latter remains UNKNOWN. Neither permits a
second writer, creates a durable receipt, changes the property history or establishes
work completion/customer acceptance. Current revocation blocks retained report reads.
Strict types, scoped ESLint, formatting and diff checks pass.
The canonical request→job FK is still absent; independently verified report→visit→plan→job
and issued-baseline references never manufacture that relationship.

Approved designs, original canonical engines and custody remain unchanged. P1/four
artifacts, thirteen historical migrations, customer14/original4B, Auth/MFA, NMI,
Netlify/recovery and financial/provider/message/dispatch/production gates persist.
Danny's Air is last unavailable; physical rehearsal remains NOT RUN. No completed
recovery baseline was repeated. No operational persistence/restoration, schema,
hosted action, credential, merge, deployment, payment, communication or dispatch.
Release 1.0 remains **NOT READY / NOT AUTHORIZED**.
