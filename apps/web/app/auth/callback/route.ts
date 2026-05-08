import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Intercambia el ?code= de Supabase PKCE por una sesión de usuario.
// Detecta el tipo de flujo (recovery, invite, etc.) para redirigir correctamente.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = searchParams.get('next')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    const params = new URLSearchParams({ error: errorDescription ?? error })
    return NextResponse.redirect(`${origin}/login?${params}`)
  }

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      const params = new URLSearchParams({ error: exchangeError.message })
      return NextResponse.redirect(`${origin}/login?${params}`)
    }

    // Recovery → mostrar formulario de nueva contraseña
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`)
    }

    // Invite → después de aceptar, ir a reset-password para que el usuario ponga su contraseña
    if (type === 'invite') {
      return NextResponse.redirect(`${origin}/reset-password`)
    }

    return NextResponse.redirect(`${origin}${next ?? '/dashboard'}`)
  }

  return NextResponse.redirect(`${origin}/login`)
}
