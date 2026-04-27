import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { HonoVariables } from './types/hono.types'

const app = new Hono<{ Variables: HonoVariables }>()

// CORS — acepta requests desde Next.js dev y producción
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      process.env['NEXT_PUBLIC_APP_URL'] ?? '',
    ].filter(Boolean),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
)

// Ruta pública — health check para Railway y monitoreo
app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
)

// API v1 — las rutas protegidas se montarán aquí por módulo
// Ejemplo: app.route('/api/v1/profiles', iamRouter)
app.get('/api/v1', (c) =>
  c.json({ message: 'FluCore API v1', status: 'ok' })
)

// 404 catch-all
app.notFound((c) =>
  c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: `Ruta ${c.req.method} ${c.req.path} no existe`,
        status: 404,
      },
    },
    404
  )
)

const port = Number(process.env['PORT'] ?? 8787)

serve(
  { fetch: app.fetch, port },
  () => {
    console.log(`[flucore-api] Servidor corriendo en http://localhost:${port}`)
    console.log(`[flucore-api] GET /health → OK`)
    console.log(`[flucore-api] NODE_ENV: ${process.env['NODE_ENV'] ?? 'development'}`)
  }
)

export { app }
