import { submitIntake } from '../../src/server/intake';
declare const Netlify: { env: { get(name: string): string | undefined } };
export default (request: Request, context: { ip?: string }) =>
  submitIntake(
    request,
    Object.fromEntries(
      [
        'SUPABASE_URL',
        'SUPABASE_PUBLISHABLE_KEY',
        'PUBLIC_INTAKE_ENABLED',
        'TURNSTILE_SECRET_KEY',
        'TURNSTILE_HOSTNAME',
        'INTAKE_GATEWAY_KEY',
        'INTAKE_RATE_LIMIT_SECRET',
      ].map((k) => [k, Netlify.env.get(k)]),
    ),
    context.ip,
  );
