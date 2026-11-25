import { withSupabase } from 'npm:@supabase/server@1.9.2';
import { createMatchHandler } from './handler.mjs';
export default { fetch: createMatchHandler(withSupabase, { url: Deno.env.get('SUPABASE_URL') }) };
