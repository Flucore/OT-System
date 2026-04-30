import type { MiddlewareHandler } from 'hono'
import { ok, err } from '@flucore/types'
import type { HonoVariables } from '../../../types/hono.types'
import { iamService } from '../iam.service.impl'
import { UpdateProfileSchema, IamError } from '../iam.types'

// PATCH /api/v1/profiles/:id — admin puede editar cualquiera; user puede editar solo el suyo
// Soft delete: PATCH { is_active: false } — nunca DELETE real
export const updateProfileHandler: MiddlewareHandler<{ Variables: HonoVariables }> = async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  // Admin edita cualquier perfil del tenant. Otros solo el propio.
  if (user.role !== 'admin' && user.id !== id) {
    return c.json(err('FORBIDDEN', 'Solo admin puede editar perfiles de otros usuarios', 403), 403)
  }

  const body = UpdateProfileSchema.safeParse(await c.req.json())
  if (!body.success) {
    return c.json(err('VALIDATION_ERROR', 'Datos inválidos', 422, body.error.flatten()), 422)
  }

  // Campos sensibles (role, is_active) solo los puede cambiar admin
  if (user.role !== 'admin' && (body.data.role !== undefined || body.data.is_active !== undefined)) {
    return c.json(err('FORBIDDEN', 'Solo admin puede cambiar rol o estado activo', 403), 403)
  }

  try {
    const profile = await iamService.update(id, body.data, user.tenant_id)
    return c.json(ok(profile))
  } catch (e) {
    if (e instanceof IamError) return c.json(err(e.code, e.message, e.status), e.status)
    throw e
  }
}
