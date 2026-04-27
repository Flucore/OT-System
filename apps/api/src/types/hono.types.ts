import type { UserRoleValue } from '@flucore/types'

// Usuario autenticado inyectado por el auth middleware
export interface AuthUser {
  id: string
  email: string
  tenant_id: string
  role: UserRoleValue
}

// Variables del contexto Hono tipadas
export type HonoVariables = {
  user: AuthUser
}
