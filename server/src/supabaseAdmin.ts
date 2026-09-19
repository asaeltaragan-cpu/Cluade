import { createClient } from "@supabase/supabase-js";

// Tolerate common paste mistakes: whitespace, trailing slash, or a /rest/v1 suffix.
const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy server/.env.example to server/.env and fill in your Supabase project values.",
  );
}

/**
 * Service-role client. Bypasses RLS entirely — only ever used from this
 * server, after requireRole() has verified the caller's own role via their
 * own JWT. Never send this key to the browser.
 */
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
