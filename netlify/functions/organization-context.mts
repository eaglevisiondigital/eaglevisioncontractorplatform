import { organizationContext } from '../../src/server/context';

declare const Netlify: { env: { get(name: string): string | undefined } };

export default (request: Request) =>
  organizationContext(request, {
    SUPABASE_URL: Netlify.env.get('SUPABASE_URL'),
    SUPABASE_PUBLISHABLE_KEY: Netlify.env.get('SUPABASE_PUBLISHABLE_KEY'),
  });
