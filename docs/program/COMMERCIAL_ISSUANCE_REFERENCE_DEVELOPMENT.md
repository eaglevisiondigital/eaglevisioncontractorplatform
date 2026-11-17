# Original issuance reference — isolated development

Parent: optional Jobs finder #546, `a668894745c3e6b873854a7e235f7b76dfe467ee`.
Release 1.0 remains **NO-GO / NOT READY / NOT AUTHORIZED**.

The existing commercial customer receipt renderer now shows the original issued
amount and UTC issuance time. Its download action reopens the exact invoice using
the existing customer reader before creating an allowlisted JSON issuance reference.
The reference identifies the original issued version and issuance receipt; payment
status stays UNKNOWN. It contains no customer/organization binding, private source
hash, session, actor or request hash.

Current controller identity and snapshot are checked again before download. A
pending click cannot issue another read; a detached controller cannot export into
a replacement view. Revoked access, malformed responses and denied reads hide prior
content. The existing parser, authorization bridge and expiry contract are unchanged.
The reader remains default-OFF and fictional-local only. No route, payment link,
provider action, issuance, customer delivery, database installation or new store is
introduced. A local file is an observation with an expiry, not durable custody,
authorization, a payment receipt, settlement or a verified current balance.

Validation: 18 new intercepted-browser cases pass across desktop, tablet and mobile,
covering fresh reads, privacy, revocation, malformed/mixed/paid claims, context
replacement, duplicate pending clicks, expiry, keyboard access and automated
accessibility checks. All network responses are controlled fixtures using the
existing server reader; this is not genuine hosted Auth/MFA acceptance.

Approved screenshot references 19 and 61 receive partial issuance-read/reference
coverage only. Their financial and operational states remain unaccepted. All 63
original reference identities and prior classifications remain retained. No artwork
or locked CSS is changed. This optional branch is not part of the launch candidate.

The existing D1 return is still incomplete; installed writer/grant/bypass inventory,
independent D2 custody and D3 recovery, genuine Auth/AAL2 and A01–A12 acceptance remain
required. Saul 2 Paul is first; Cunningham requires separate tenant/customer/merchant
acceptance. Both VAR/NMI boarding dependencies remain pending. Operational invoice
SQL/grants and provider execution require separate exact authorization.
