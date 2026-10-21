import { createClient } from '@supabase/supabase-js';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Type': 'application/json',
};
export function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}

// Keep the caller's token throughout: no service-role key, no RLS bypass.
export async function organizationContext(
  request: Request,
  env: Record<string, string | undefined> = {},
) {
  if (request.method !== 'GET')
    return reply(405, { error: 'Method not allowed' });
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token) return reply(401, { error: 'Authentication required' });
  const id = new URL(request.url).searchParams.get('organization_id');
  if (
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return reply(400, { error: 'Valid organization_id required' });
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
    return reply(503, { error: 'Service not configured' });
  try {
    const client = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_PUBLISHABLE_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error || !user) return reply(401, { error: 'Invalid session' });
    // Membership is required even for platform admins: the control plane is separate.
    const { data: membership, error: membershipError } = await client
      .from('memberships')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();
    if (membershipError || !membership)
      return reply(403, { error: 'Access denied' });
    const { data, error: orgError } = await client
      .from('organizations')
      .select(
        'id,name,slug,industry,primary_color,accent_color,business_info,logo_document_id',
      )
      .eq('id', id)
      .maybeSingle();
    if (orgError || !data) return reply(403, { error: 'Access denied' });
    return reply(200, { organization: data, role: membership.role });
  } catch {
    return reply(503, { error: 'Service unavailable' });
  }
}
