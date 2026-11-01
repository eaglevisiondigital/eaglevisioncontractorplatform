import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Closed customer routes and synthetic previews must not initialize staff Auth,
// consume callback codes or refresh a stored staff session. Internal release is separate.
const path = typeof window === 'undefined' ? '/' : window.location.pathname;
const closed =
  path.startsWith('/preview') ||
  (path.startsWith('/portal') && path !== '/portal/internal');
export const supabase =
  !closed && url && key ? createClient<Database>(url, key) : null;
