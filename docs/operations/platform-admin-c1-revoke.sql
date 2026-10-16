-- REVIEW TEMPLATE ONLY. Part of the same proposed C1 approval/cleanup operation.
-- Stop/drain platform RPCs before revocation; never roll cleanup back for unrelated drift.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
LOCK TABLE private.platform_admins IN SHARE ROW EXCLUSIVE MODE;
UPDATE private.platform_admins SET active = false
WHERE user_id = '__OPERATOR_UID__'::uuid AND active;
COMMIT;
SELECT jsonb_build_object(
  'verified_at', clock_timestamp(),
  'operator_active', EXISTS (SELECT 1 FROM private.platform_admins WHERE user_id = '__OPERATOR_UID__'::uuid AND active),
  'operator_row_retained', EXISTS (SELECT 1 FROM private.platform_admins WHERE user_id = '__OPERATOR_UID__'::uuid),
  'operator_memberships', (SELECT count(*) FROM public.memberships WHERE user_id = '__OPERATOR_UID__'::uuid)
) AS c1_revocation;
-- Next: verify real caller platform_access=false with its previously AAL2 JWT;
-- then auth.signOut({scope:'global'}), verify zero operator sessions and clear local state.
-- Do not delete/reset Auth identities/factors, tenant fixtures, other grants or audit history.
