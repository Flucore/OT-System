import type { MiddlewareHandler } from 'hono'
import { ok, err } from '@flucore/types'
import type { HonoVariables } from '../../../types/hono.types'
import { iamService } from '../iam.service.impl'
import { IamError } from '../iam.types'

// GET /api/v1/profiles/me — cualquier rol autenticado
export const getMeHandler: MiddlewareHandler<{ Variables: HonoVariables }> = async (c) => {
  const user = c.get('user')
  try {
    const profile = await iamService.getMe(user.id, user.tenant_id)
    return c.json(ok(profile))
  } catch (e) {
    if (e instanceof IamError) return c.json(err(e.code, e.message, e.status), e.status)
    throw e
  }
}

// GET /api/v1/profiles/:id — solo admin o manager
export const getByIdHandler: MiddlewareHandler<{ Variables: HonoVariables }> = async (c) => {
  const user = c.get('user')

  if (!['admin', 'manager'].includes(user.role)) {
    return c.json(err('FORBIDDEN', 'Solo admin o manager pueden consultar perfiles por ID', 403), 403)
  }

  const id = c.req.param('id')
  if (!id) return c.json(err('VALIDATION_ERROR', 'ID requerido', 400), 400)

  try {
    const profile = await iamService.getById(id, user.tenant_id)
    return c.json(ok(profile))
  } catch (e) {
    if (e instanceof IamError) return c.json(err(e.code, e.message, e.status), e.status)
    throw e
  }
}
