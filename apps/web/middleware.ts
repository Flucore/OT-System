import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Rutas que NO requieren autenticación
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/display']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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
