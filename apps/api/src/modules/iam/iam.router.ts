import { Hono } from 'hono'
import { authMiddleware } from '../../middleware/auth.middleware'
import type { HonoVariables } from '../../types/hono.types'
import { getMeHandler, getByIdHandler } from './handlers/get-profile.handler'
import { listProfilesHandler } from './handlers/list-profiles.handler'
import { createProfileHandler } from './handlers/create-profile.handler'
import { updateProfileHandler } from './handlers/update-profile.handler'

export const iamRouter = new Hono<{ Variables: HonoVariables }>()

// Todas las rutas de este router requieren autenticación
iamRouter.use('*', authMiddleware)

// IMPORTANTE: /me ANTES de /:id — rutas estáticas tienen prioridad pero ser explícito es más seguro
iamRouter.get('/me', getMeHandler)
iamRouter.get('/', listProfilesHandler)
iamRouter.get('/:id', getByIdHandler)
iamRouter.post('/', createProfileHandler)
iamRouter.patch('/:id', updateProfileHandler)
