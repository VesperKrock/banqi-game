import { withSupabase } from 'npm:@supabase/server@1.9.2';
import { createPreflightHandler } from './handler.mjs';

// The platform verifies JWTs; auth:'user' also rejects API-key-only callers.
export default {
  fetch: createPreflightHandler(withSupabase, { url: Deno.env.get('SUPABASE_URL') }),
};
