'use client'

import { useEffect } from 'react'

// La raíz actúa como relay:
// - Si hay ?code= → el middleware ya lo envió a /auth/callback
// - Si hay #access_token + type=recovery (flujo legacy) → redirigir a /reset-password
// - Si hay sesión activa → redirigir a /dashboard
// - Sin sesión → redirigir a /login
export default function RootPage() {
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery') || hash.includes('type=invite')) {
      window.location.href = '/reset-password' + hash
      return
    }

    // Para magic link o cualquier access_token en hash (flujo implicit)
    if (hash.includes('access_token')) {
      window.location.href = '/dashboard'
      return
    }

    // Fallback: ir al dashboard (el middleware redirigirá a /login si no hay sesión)
    window.location.href = '/dashboard'
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <div className="h-8 w-1 animate-pulse rounded-full bg-sky-500" />
          <span className="text-2xl font-semibold tracking-tight text-white">FluCore</span>
        </div>
        <p className="text-xs text-slate-600">Cargando…</p>
      </div>
    </main>
  )
}
