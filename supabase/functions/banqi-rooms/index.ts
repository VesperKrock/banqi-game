import { withSupabase } from 'npm:@supabase/server@1.9.2';
import { createRoomsHandler } from './handler.mjs';

export default { fetch: createRoomsHandler(withSupabase, { url: Deno.env.get('SUPABASE_URL') }) };
