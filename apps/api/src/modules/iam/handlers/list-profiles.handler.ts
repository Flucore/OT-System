import type { MiddlewareHandler } from 'hono'
import { ok, err } from '@flucore/types'
import type { HonoVariables } from '../../../types/hono.types'
import { iamService } from '../iam.service.impl'
import { IamError } from '../iam.types'

// GET /api/v1/profiles — admin, manager, supervisor
export const listProfilesHandler: MiddlewareHandler<{ Variables: HonoVariables }> = async (c) => {
  const user = c.get('user')

  if (!['admin', 'manager', 'supervisor'].includes(user.role)) {
    return c.json(err('FORBIDDEN', 'Rol insuficiente para listar perfiles', 403), 403)
  }

  try {
    const profiles = await iamService.list(user.tenant_id)
    return c.json(ok(profiles, { total: profiles.length }))
  } catch (e) {
    if (e instanceof IamError) return c.json(err(e.code, e.message, e.status), e.status)
    throw e
  }
}
