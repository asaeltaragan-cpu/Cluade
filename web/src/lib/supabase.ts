import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy web/.env.example to web/.env.local and fill in your Supabase project values.",
  );
}

/**
 * Intentionally untyped generic (no Database<> param): the hand-authored
 * Database type in database.types.ts is kept as documentation and for
 * `Tables<T>` row shapes used across the app, but supabase-js's generic
 * constraints are version-sensitive enough that passing it here made every
 * .from() call collapse to `never`. Row shapes are asserted at the call
 * site instead (see use-app-data.ts / mutations.ts).
 */
export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: { persistSession: true, autoRefreshToken: true },
});
