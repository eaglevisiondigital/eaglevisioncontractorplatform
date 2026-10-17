-- REVIEW TEMPLATE ONLY. No hosted execution without separate exact owner approval.
-- Target and resolved UID/email belong only in the ignored private review bundle.
-- Start the 30-minute operator window BEFORE executing; never reset it on retry.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
LOCK TABLE private.platform_admins IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.memberships, public.organizations IN SHARE MODE;
DO $c1$
DECLARE
  operator_id constant uuid := '__OPERATOR_UID__';
BEGIN
  IF (SELECT count(*) FROM auth.users) <> 22
     OR (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL AND NOT is_anonymous) <> 22
     OR (SELECT count(*) FROM auth.mfa_factors WHERE status::text = 'verified' AND factor_type::text = 'totp') <> 4
     OR EXISTS (SELECT 1 FROM auth.mfa_factors WHERE status::text <> 'verified') THEN
    RAISE EXCEPTION 'C1 identity or factor baseline drift';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = operator_id
    AND email = '__OPERATOR_EMAIL__' AND email_confirmed_at IS NOT NULL
    AND NOT is_anonymous FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C1 exact operator identity mismatch'; END IF;
  IF (SELECT count(*) FROM auth.mfa_factors WHERE user_id = operator_id
      AND status::text = 'verified' AND factor_type::text = 'totp') <> 1 THEN
    RAISE EXCEPTION 'C1 operator factor mismatch';
  END IF;
  -- External fresh getUser/getClaims must also bind the sole session_id to this UID.
  IF (SELECT count(*) FROM auth.sessions WHERE user_id = operator_id) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM auth.sessions s JOIN auth.mfa_factors f ON f.id = s.factor_id
       WHERE s.user_id = operator_id AND f.user_id = operator_id
         AND s.aal::text = 'aal2' AND f.status::text = 'verified'
         AND f.factor_type::text = 'totp'
         AND s.created_at >= transaction_timestamp() - interval '5 minutes'
         AND s.created_at <= transaction_timestamp()
         AND (s.not_after IS NULL OR s.not_after > clock_timestamp())
     ) THEN RAISE EXCEPTION 'C1 fresh genuine operator AAL2 session required'; END IF;
  IF EXISTS (SELECT 1 FROM private.platform_admins)
     OR EXISTS (SELECT 1 FROM public.memberships)
     OR EXISTS (SELECT 1 FROM public.organizations)
     OR EXISTS (SELECT 1 FROM private.release_test_users)
     OR EXISTS (SELECT 1 FROM private.material_worker_grants) THEN
    RAISE EXCEPTION 'C1 grant or tenant baseline drift; no replacement or upsert';
  END IF;
  INSERT INTO private.platform_admins(user_id, active) VALUES (operator_id, true);
  IF (SELECT count(*) FROM private.platform_admins) <> 1
     OR NOT EXISTS (SELECT 1 FROM private.platform_admins WHERE user_id = operator_id AND active)
     OR EXISTS (SELECT 1 FROM public.memberships WHERE user_id = operator_id) THEN
    RAISE EXCEPTION 'C1 postcondition failed';
  END IF;
END
$c1$;
COMMIT;
SELECT jsonb_build_object(
  'verified_at', clock_timestamp(),
  'operator_active', EXISTS (SELECT 1 FROM private.platform_admins WHERE user_id = '__OPERATOR_UID__'::uuid AND active),
  'platform_rows', (SELECT count(*) FROM private.platform_admins),
  'operator_memberships', (SELECT count(*) FROM public.memberships WHERE user_id = '__OPERATOR_UID__'::uuid)
) AS c1_result;
