import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ok, err } from '@flucore/types'
import type { HonoVariables } from './types/hono.types'
import { authMiddleware } from './middleware/auth.middleware'
import { errorMiddleware } from './middleware/error.middleware'
import { supabaseAdmin } from './lib/supabase-admin'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(errorMiddleware)

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

// ── Rutas públicas ────────────────────────────────────────────────────────────

app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
)

// ── Rutas protegidas (/api/v1/*) ──────────────────────────────────────────────

app.get('/api/v1', (c) => c.json({ message: 'FluCore API v1', status: 'ok' }))

// Devuelve el perfil del usuario autenticado.
// Requiere que exista una fila en profiles con el id del JWT.
// Si no existe: el backend IAM aún no creó el perfil (Prompt #4).
app.get('/api/v1/me', authMiddleware, async (c) => {
  const user = c.get('user')

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, tenant_id, full_name, role, email, is_active, created_at, updated_at')
    .eq('id', user.id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (error || !profile) {
    return c.json(err('PROFILE_NOT_FOUND', 'Perfil no encontrado', 404), 404)
  }

  return c.json(ok(profile))
})

// ── 404 catch-all ─────────────────────────────────────────────────────────────

app.notFound((c) =>
  c.json(
    err('NOT_FOUND', `Ruta ${c.req.method} ${c.req.path} no existe`, 404),
    404
  )
)

// ─────────────────────────────────────────────────────────────────────────────

const port = Number(process.env['PORT'] ?? 8787)

serve(
  { fetch: app.fetch, port },
  () => {
    console.log(`[flucore-api] Servidor corriendo en http://localhost:${port}`)
    console.log(`[flucore-api] GET /health → OK`)
    console.log(`[flucore-api] GET /api/v1/me → requiere Bearer token`)
    console.log(`[flucore-api] NODE_ENV: ${process.env['NODE_ENV'] ?? 'development'}`)
  }
)

export { app }
