// Para React Server Components, Route Handlers y Server Actions.
// Usa cookies de la sesión del usuario. NUNCA exponer SERVICE_ROLE_KEY aquí.
// Next.js 15: cookies() es async — llamar con await.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // ANON KEY — el RLS protege
    { cookies: { get: (n: string) => cookieStore.get(n)?.value } }
  )
}
