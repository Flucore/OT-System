import type { MiddlewareHandler } from 'hono'
import { err } from '@flucore/types'
import type { UserRoleValue } from '@flucore/types'
import { supabaseAdmin } from '../lib/supabase-admin'
import type { HonoVariables } from '../types/hono.types'

interface JwtPayload {
  sub: string
  email?: string
  tenant_id?: string
  role?: string
}

// Decodifica el payload (sin verificar firma — Supabase ya lo hizo en getUser).
// Buffer.from(..., 'base64url') maneja los chars URL-safe del JWT.
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf-8')) as JwtPayload
  } catch {
    return null
  }
}

export const authMiddleware: MiddlewareHandler<{ Variables: HonoVariables }> = async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(err('UNAUTHORIZED', 'Token de acceso requerido', 401), 401)
  }

  const token = authHeader.slice(7)

  // Supabase valida firma + expiración. Si falla, el token es inválido.
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    return c.json(err('UNAUTHORIZED', 'Token inválido o expirado', 401), 401)
  }

  // El custom_access_token_hook inyecta tenant_id y role en el payload del JWT.
  // Sin el hook activo, estos campos vienen null y el sistema no puede operar.
  const claims = decodeJwtPayload(token)

  if (!claims?.tenant_id || !claims?.role) {
    return c.json(
      err('UNAUTHORIZED', 'Token sin claims de tenant — verificar custom_access_token_hook activo', 401),
      401
    )
  }

  c.set('user', {
    id: user.id,
    email: user.email ?? '',
    tenant_id: claims.tenant_id,
    role: claims.role as UserRoleValue,
  })

  await next()
}
