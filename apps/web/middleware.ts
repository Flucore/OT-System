import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Rutas que NO requieren autenticación
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/reset-password', '/display']

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Supabase envía el code a la raíz (/?) — redirigir a /auth/callback para el PKCE exchange.
  // Ocurre en password reset, magic link e invitaciones.
  if (pathname === '/' && searchParams.has('code')) {
    const callbackUrl = new URL('/auth/callback', request.url)
    callbackUrl.searchParams.set('code', searchParams.get('code')!)
    // Preservar type (recovery, invite, magiclink) para que el callback sepa a dónde redirigir
    const type = searchParams.get('type')
    if (type) callbackUrl.searchParams.set('type', type)
    const next = searchParams.get('next')
    if (next) callbackUrl.searchParams.set('next', next)
    return NextResponse.redirect(callbackUrl)
  }

  // Permitir rutas públicas sin verificar sesión
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Refrescar sesión y obtener cliente autenticado
  const { response, supabase } = await updateSession(request)

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Excluir _next/static, _next/image, favicon, archivos de Service Worker
    '/((?!_next/static|_next/image|favicon.ico|sw.js|workbox-|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
