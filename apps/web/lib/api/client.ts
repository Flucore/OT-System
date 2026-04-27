'use client'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ApiError } from '@flucore/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

// Obtiene el token de acceso de la sesión activa de Supabase.
// Exportado para pasarlo a initSyncEngine del paquete offline.
export async function getAccessToken(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

interface FetchApiOptions extends RequestInit {
  skipAuth?: boolean
}

// Función base para llamar al backend Hono.
// SIEMPRE incluir el token de sesión en Authorization.
export async function fetchApi<T>(
  path: string,
  options: FetchApiOptions = {}
): Promise<T> {
  const { skipAuth = false, ...init } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }

  if (!skipAuth) {
    const token = await getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({
      error: { code: 'NETWORK_ERROR', message: res.statusText, status: res.status },
    }))) as ApiError

    const err = new Error(body.error.message)
    ;(err as Error & { code: string; status: number }).code = body.error.code
    ;(err as Error & { code: string; status: number }).status = body.error.status
    throw err
  }

  return res.json() as Promise<T>
}
