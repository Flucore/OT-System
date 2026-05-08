// Cliente admin para Server Components ÚNICAMENTE.
// Bypassa RLS usando SERVICE_ROLE_KEY — NUNCA importar desde archivos 'use client'.
// Usar solo para leer datos del usuario autenticado (después de verificar auth.getUser()).
import { createClient } from '@supabase/supabase-js'

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Supabase admin client: faltan variables de entorno')
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
