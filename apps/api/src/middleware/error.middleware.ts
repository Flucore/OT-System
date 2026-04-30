import type { ErrorHandler } from 'hono'
import { ZodError } from 'zod'
import { err } from '@flucore/types'

export const errorMiddleware: ErrorHandler = (error, c) => {
  if (error instanceof ZodError) {
    return c.json(
      err('VALIDATION_ERROR', 'Datos de entrada inválidos', 422, error.flatten()),
      422
    )
  }

  // Solo en desarrollo exponer el mensaje real — en producción nunca el stack.
  const isDev = process.env['NODE_ENV'] !== 'production'
  console.error(`[${new Date().toISOString()}] UNHANDLED ERROR:`, error)

  return c.json(
    err('UNHANDLED', 'Error interno del servidor', 500, isDev ? error.message : undefined),
    500
  )
}
