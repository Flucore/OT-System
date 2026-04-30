import type { MiddlewareHandler } from 'hono'
import { ok, err } from '@flucore/types'
import type { HonoVariables } from '../../../types/hono.types'
import { iamService } from '../iam.service.impl'
import { CreateProfileSchema, IamError } from '../iam.types'

// POST /api/v1/profiles — solo admin
// Crea usuario en auth.users + inserta en profiles (atomicidad manual con rollback)
export const createProfileHandler: MiddlewareHandler<{ Variables: HonoVariables }> = async (c) => {
  const user = c.get('user')

  if (user.role !== 'admin') {
    return c.json(err('FORBIDDEN', 'Solo admin puede crear perfiles', 403), 403)
  }

  const body = CreateProfileSchema.safeParse(await c.req.json())
  if (!body.success) {
    return c.json(err('VALIDATION_ERROR', 'Datos inválidos', 422, body.error.flatten()), 422)
  }

  try {
    const profile = await iamService.create(body.data, user.tenant_id)
    return c.json(ok(profile), 201)
  } catch (e) {
    if (e instanceof IamError) return c.json(err(e.code, e.message, e.status), e.status)
    throw e
  }
}
