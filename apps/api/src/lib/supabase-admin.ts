import { createClient } from '@supabase/supabase-js'

// SERVICE_ROLE bypasea RLS — existe SOLO aquí, nunca en el browser ni en apps/web.
// persistSession: false → sin cookies, el backend es stateless.
export const supabaseAdmin = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)
