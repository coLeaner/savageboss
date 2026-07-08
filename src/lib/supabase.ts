import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Public, RLS-protected keys — safe to ship to the browser. When they're
// missing (e.g. before the project is wired up) we return null so the
// guestbook can degrade gracefully instead of crashing the page.
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
	url && key ? createClient(url, key) : null;
