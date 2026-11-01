import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { validateIntake, uuidPattern } from '../domain/intake';
import { reply } from './context';
import type { Database, Json } from '../lib/database.types';
type Env = Record<string, string | undefined>;
export async function limitedJson(
  request: Request,
  limit = 18000,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Body required');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Request too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function client(env: Env) {
  return createClient<Database>(
    env.SUPABASE_URL!,
    env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function intakeProfile(request: Request, env: Env) {
  if (request.method !== 'GET')
    return reply(405, { error: 'Method not allowed' });
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100)
    return reply(400, { error: 'Invalid company link' });
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
    return reply(503, { error: 'Intake is not configured' });
  try {
    const { data, error } = await client(env).rpc('intake_profile', {
      p_slug: slug,
    });
    if (error || !data) return reply(404, { error: 'Intake is unavailable' });
    return reply(200, {
      profile: data,
      site_key: env.TURNSTILE_SITE_KEY ?? null,
      ready:
        env.PUBLIC_INTAKE_ENABLED === 'true' &&
        !!env.TURNSTILE_SITE_KEY &&
        !!env.TURNSTILE_SECRET_KEY &&
        !!env.INTAKE_GATEWAY_KEY &&
        !!env.INTAKE_RATE_LIMIT_SECRET &&
        !!env.TURNSTILE_HOSTNAME,
    });
  } catch {
    return reply(503, { error: 'Intake unavailable' });
  }
}
export async function submitIntake(
  request: Request,
  env: Env,
  trustedIp: string | undefined,
) {
  if (request.method !== 'POST')
    return reply(405, { error: 'Method not allowed' });
  if (
    env.PUBLIC_INTAKE_ENABLED !== 'true' ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_PUBLISHABLE_KEY ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.TURNSTILE_HOSTNAME ||
    (env.INTAKE_GATEWAY_KEY?.length ?? 0) < 32 ||
    (env.INTAKE_RATE_LIMIT_SECRET?.length ?? 0) < 32 ||
    !trustedIp
  )
    return reply(503, { error: 'Submissions are not configured' });
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return reply(403, { error: 'Request denied' });
  let body: Record<string, unknown>;
  let payload;
  try {
    const value = await limitedJson(request);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    body = value as Record<string, unknown>;
    if (
      Object.keys(body).some(
        (k) =>
          ![
            'slug',
            'payload',
            'verification_token',
            'honeypot',
            'idempotency_key',
          ].includes(k),
      ) ||
      typeof body.slug !== 'string' ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.slug) ||
      body.slug.length > 100 ||
      typeof body.idempotency_key !== 'string' ||
      !uuidPattern.test(body.idempotency_key) ||
      typeof body.verification_token !== 'string' ||
      body.verification_token.length > 2048 ||
      body.honeypot !== ''
    )
      throw new Error();
    payload = validateIntake(body.payload);
  } catch {
    return reply(400, { error: 'Check the request fields' });
  }
  try {
    const verification = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: String(body.verification_token),
          remoteip: trustedIp,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    const result = (await verification.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    if (
      !verification.ok ||
      !result.success ||
      result.hostname !== env.TURNSTILE_HOSTNAME ||
      result.action !== 'estimate_request'
    )
      return reply(403, { error: 'Verification failed. Please try again.' });
    const fingerprint = createHmac('sha256', env.INTAKE_RATE_LIMIT_SECRET!)
      .update(trustedIp)
      .digest('hex');
    const { data, error } = await client(env).rpc('submit_intake_gateway', {
      p_gateway_key: env.INTAKE_GATEWAY_KEY!,
      p_slug: String(body.slug),
      p_payload: payload as unknown as Json,
      p_fingerprint: fingerprint,
      p_key: String(body.idempotency_key),
    });
    if (error) return reply(400, { error: 'Request could not be accepted' });
    const status =
      data && typeof data === 'object' && !Array.isArray(data)
        ? data.status
        : null;
    if (status === 'rate_limited')
      return reply(429, {
        error: 'Too many requests. Please try again later.',
      });
    if (status !== 'accepted')
      return reply(404, { error: 'Intake unavailable' });
    return reply(202, { accepted: true });
  } catch {
    return reply(503, {
      error: 'Submission unavailable. Please try again later.',
    });
  }
}
