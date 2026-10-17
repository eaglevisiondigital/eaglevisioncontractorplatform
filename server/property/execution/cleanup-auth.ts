import { isUuid, type FrozenP1, requireFrozen } from './package.ts';
export async function verifyCleanupSession(
  frozen: FrozenP1,
  apiKey: string,
  alias: string,
  token: string,
  factorId?: string,
  pendingOwner = false,
  request: typeof fetch = fetch,
) {
  requireFrozen(frozen);
  const actor = frozen.plan.companies
    .flatMap((c) => Object.values(c.actorBindings))
    .find((a) => a.alias === alias);
  if (!actor || /customer/.test(alias)) throw Error('Actor outside P1');
  const r = await request(`https://${frozen.target}.supabase.co/auth/v1/user`, {
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: { apikey: apiKey, Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw Error('Auth handoff unverified');
  const u = await r.json();
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    );
  } catch {
    throw Error('Signed claim format');
  }
  // Auth has validated this exact JWT remotely before examining its signed claims.
  const owner = actor.role === 'owner';
  if (
    u.id !== actor.user_id ||
    !u.email_confirmed_at ||
    u.is_anonymous ||
    claims.sub !== actor.user_id ||
    claims.role !== 'authenticated' ||
    claims.iss !== `https://${frozen.target}.supabase.co/auth/v1` ||
    !isUuid(claims.session_id) ||
    !Number.isFinite(Number(claims.exp)) ||
    Number(claims.exp) * 1000 <= Date.now() + 15000 ||
    claims.aal !== (owner && !pendingOwner ? 'aal2' : 'aal1') ||
    (pendingOwner && !owner)
  )
    throw Error('Auth binding/AAL changed');
  if (
    owner &&
    !pendingOwner &&
    !(
      u.factors as
        { id: string; factor_type: string; status: string }[] | undefined
    )?.some(
      (f) =>
        f.id === factorId &&
        f.factor_type === 'totp' &&
        f.status === 'verified',
    )
  )
    throw Error('Existing owner factor not verified');
  return {
    uid: actor.user_id,
    owner,
    sessionId: String(claims.session_id),
    pending: pendingOwner,
  };
}
