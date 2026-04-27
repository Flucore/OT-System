# FLUCORE MVP — Plan de Desarrollo 2 Semanas + Prompts de IA
**Versión:** 2.0 (refundición completa, alineada al estado real del proyecto)
**Modo:** Vibe Coding asistido por IA (Claude Code + Cursor)
**Output esperado:** Código de producción funcional, no maquetas, **offline-first por diseño**.

**Documentación de referencia obligatoria:**
- `FLUCORE_AI_CONTEXT_v2.2.md` (contenido v2.3) — contrato arquitectónico
- `FLUCORE_OFFLINE_ARCH.md` — arquitectura offline-first
- `FLUCORE_TECH_STACK.md` — versiones y decisiones
- `FLUCORE_RECOMMENDATIONS.md` — checklist accionable
- `FLUCORE_VIBE_PROTOCOL.md` — commit protocol y manejo de sesiones
- `001_core_schema_1.sql` — schema SQL base
- `supabase/migrations/003_offline_sync_support.sql` — schema offline
- `packages/offline/` — paquete `@flucore/offline` ya implementado
- `.cursor/rules/*.mdc` — 4 reglas activas en Cursor

---

## 0. ESTADO INICIAL (lo que YA existe — no reinventar)

| Asset | Estado | Ubicación |
|-------|--------|-----------|
| Schema SQL completo + RLS granular | ✅ Listo | `/001_core_schema_1.sql` |
| Migración offline (trigger + columnas sync) | ✅ Listo | `/supabase/migrations/003_offline_sync_support.sql` |
| Paquete `@flucore/offline` (Dexie + sync engine + hooks) | ✅ Listo | `/packages/offline/src/` |
| Documentos maestros (5 .md) | ✅ Listos | `/FLUCORE_*.md` |
| Reglas Cursor (core, ts, sql, offline) | ✅ Listas | `/.cursor/rules/*.mdc` |
| Monorepo `/apps/*` y `/packages/types`, `/packages/utils` | 🔲 Pendiente | Día 1 |
| Proyecto Supabase + JWT hook | 🔲 Pendiente | Día 0 (manual) |

**No regenerar archivos existentes. Si algún prompt parece pisarlos, detenerse y preguntar.**

---

## 1. OPINIÓN COMO ARQUITECTO

El orden Auth → DB → Formularios → UI sigue siendo correcto, pero ahora se inserta **una capa que cambia todo: la cola offline**. El error clásico sería tratar el offline como "feature posterior". Aquí lo trataremos como infraestructura del Día 1.

Nuevo orden de dependencias (no negociable):

```
Día 0:  Supabase + JWT hook                  ← sin esto, nada funciona
Día 1:  Monorepo + Next.js + Hono + PWA      ← infra base
Día 2:  Auth backend (Hono middleware)
Día 3:  Auth frontend (login + sesión)
Día 4:  IAM + Seed Medplan
Día 5:  Equipment + Clients (RSC + lectura directa)
Día 6:  Backend Tickets + state machine
Día 7:  FUI offline-first (useOfflineTicket)
Día 8:  Checklist 39 puntos offline-first
Día 9:  PDF informe + Agente IA
Día 10: Kanban Realtime + TV display + tests
```

**Estimación realista:**
- **Sprint 1 (Días 0–3):** Infraestructura + Auth funcionando con offline awareness inicializada.
- **Sprint 2 (Días 4–7):** FUI completo con creación offline real.
- **Sprint 3 (Días 8–10):** Diagnóstico, IA, Kanban y tests.

Al final del Día 10 el supervisor podrá crear una FUI **sin red**, el técnico podrá llenar los 39 puntos **sin red**, y todo se sincroniza al reconectar.

---

## 2. PROTOCOLO DE TRABAJO PARA CADA DÍA

Cada jornada sigue el mismo ciclo (ver `FLUCORE_VIBE_PROTOCOL.md`):

```
INICIO:
  [ ] git log -1 → ver dónde quedé
  [ ] Adjuntar al agente: FLUCORE_AI_CONTEXT_v2.2.md + archivo del día
  [ ] Verificar que las 4 cursor rules están activas

EJECUCIÓN:
  [ ] Ejecutar prompt(s) del día
  [ ] Probar el test manual del día (no marcar como hecho sin pasar)

CIERRE (CRÍTICO — ver lección de pérdida de trabajo):
  [ ] git add -A && git commit -m "{tipo}({scope}): {desc}"
  [ ] Actualizar "Estado actual" en FLUCORE_VIBE_PROTOCOL.md
  [ ] Si quedó deuda técnica: anotarla en RECOMMENDATIONS.md sección 8
```

> ⚠️ **Lección 2026-04-26:** Una sesión completa de trabajo se perdió por no commitear. **Commit obligatorio al final de CADA día**, mínimo. Mejor: 1 commit por archivo importante.

---

## 3. SPRINT 1 — INFRAESTRUCTURA Y AUTH (Días 0–4)

### DÍA 0 — Supabase + JWT Hook (medio día, manual)
**Objetivo:** DB real corriendo en Supabase con RLS y JWT hook activo.
**Sin esto, nada del resto funciona.**

#### Tarea 0.1 — Crear proyecto Supabase (manual, 20 min)
```
1. supabase.com → New Project → "flucore-dev" (región: South America - São Paulo)
2. Project Settings → Database → copiar DATABASE_URL
3. Project Settings → API → copiar SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
4. SQL Editor → ejecutar 001_core_schema_1.sql COMPLETO
   ⚠️ Si Supabase muestra "New table will not have RLS enabled":
      → Click "Run and enable RLS" (botón verde)
      → El SQL ya tiene ENABLE ROW LEVEL SECURITY en cada tabla; el popup es solo aviso.
5. SQL Editor → ejecutar 003_offline_sync_support.sql
6. Verificar en Table Editor: todas las tablas con candado (RLS activo)
7. Authentication → Providers → habilitar Email + deshabilitar "Confirm email" (dev only)
8. Authentication → URL Configuration → Site URL: http://localhost:3000
9. Storage → Create bucket "flucore-vault" (PRIVATE)
```

#### Tarea 0.2 — JWT custom hook (Prompt #2 → ver sección PROMPTS)

Tras correr Prompt #2:
```
1. Database → Functions → verificar custom_access_token_hook creada
2. Authentication → Hooks → Custom Access Token → seleccionar la función
3. Test: crear usuario en Authentication → Users, ejecutar login curl, decodificar JWT,
   verificar que tiene "tenant_id" y "role" en payload
```

> ⚠️ **CRÍTICO:** Sin este hook `auth.jwt() ->> 'tenant_id'` retorna `null` y RLS bloquea todo silenciosamente. **No saltar al Día 1 sin validar.**

**Commit checkpoint:**
```bash
git commit -m "config(infra): supabase project created with RLS + JWT hook"
```

---

### DÍA 1 — Monorepo + Next.js + Hono + PWA
**Objetivo:** Estructura completa montada, ambas apps compilando, PWA configurado.
- **Prompt #1:** Inicialización monorepo completo (incluye next-pwa y @flucore/offline como workspace)
- **Test manual:** `npm run dev:api` → `curl http://localhost:8787/health` → `{"status":"ok"}`
  `npm run dev:web` → http://localhost:3000 → muestra "FluCore"

**Commit:** `feat(infra): init monorepo with next.js + hono + pwa + offline workspace`

---

### DÍA 2 — Backend: Hono auth middleware + módulo IAM
**Objetivo:** API protegida, JWT validado, endpoint `/me` funcional.
- **Prompt #3:** Hono base + auth middleware + error middleware
- **Prompt #4:** Módulo IAM completo (perfiles, roles, listado, creación)
- **Test manual:**
  ```bash
  TOKEN=$(curl -X POST .../auth/v1/token?grant_type=password ...)
  curl -H "Authorization: Bearer $TOKEN" http://localhost:8787/api/v1/me
  ```

**Commit:** `feat(iam): hono auth middleware + iam module with profiles CRUD`

---

### DÍA 3 — Frontend: Next.js auth + clientes Supabase + offline init
**Objetivo:** Login real con sesión persistente, sync engine inicializado al loguearse.
- **Prompt #5:** Clientes Supabase (server.ts, client.ts), middleware Next.js, layout protegido con `initSyncEngine`
- **Prompt #6:** Páginas de login + callback + dashboard inicial + indicador de estado de red

**Detalle clave Día 3 (offline integration):**
El `app/(dashboard)/layout.tsx` debe:
1. Inicializar `initSyncEngine(getAccessToken)` una sola vez con `useEffect`
2. Renderizar `<NetworkStatusIndicator />` y `<SyncStatusBadge />` en el header
3. Hidratar el cache de referencias (clients, branches, device_models, profiles) la primera vez que se loguea con red

**Test manual:**
1. Login → Dashboard
2. DevTools → Network → Offline → ver que el badge cambia a "Sin conexión"
3. DevTools → Application → IndexedDB → `flucore_local_db` debe existir con stores

**Commit:** `feat(auth,frontend): supabase ssr clients + login flow + offline init`

---

### DÍA 4 — Seed Medplan + Admin panel
**Objetivo:** Datos reales en DB, panel para crear usuarios.
- **Prompt #7:** Seed completo (`002_medplan_seed.sql`)
- **Prompt #8:** Página `/admin/users` para crear perfiles del tenant
- **Test manual:** Crear técnico de diagnóstico desde la UI, hacer login con esa cuenta

**Commit:** `feat(iam): seed medplan + admin users panel`

---

## 4. SPRINT 2 — FUI + EQUIPMENT (Días 5–7)

### DÍA 5 — Módulo Equipment + Clientes
**Objetivo:** CRUD de clientes, sucursales y equipos. Lectura directa de Supabase con cache offline.
- **Prompt #9:** Backend endpoints `equipment` / `clients` / `branches` (POST/PATCH solamente — los GET son directos)
- **Prompt #10:** Frontend CRUD equipos (formulario + listado + cache en `localDB.deviceModels`, `localDB.clients`, `localDB.branches`)
- **Test manual:** Crear Olympus GIF-H190 para sucursal RedSalud Temuco; recargar offline y verificar que el listado sigue funcionando desde cache.

**Commit:** `feat(equipment): clients/branches/equipment CRUD with offline cache`

---

### DÍA 6 — Backend Tickets + State Machine
**Objetivo:** Endpoints de tickets que respeten el JWT, máquina de estados, hook de sincronización offline.
- **Prompt #11:** Módulo `tickets` completo en Hono — incluye soporte para tickets que llegan con `ticket_number = "OFFLINE-..."` y `_client_updated_at`
- **Test manual:** Crear ticket via curl con un `ticket_number = "OFFLINE-20260501-001"` y verificar que el trigger SQL le asigna el número definitivo `MED-2026-XXXX`.

**Commit:** `feat(tickets): backend tickets module with state machine + offline support`

---

### DÍA 7 — FUI offline-first (Frontend)
**Objetivo:** Crear FUI sin red, sincronización automática al reconectar.
- **Prompt #12:** Formulario FUI usando `useOfflineTicket().createTicket(...)` — NO `fetch` directo
- **Prompt #13:** Generación QR (`qrcode`) y vista de detalle del ticket que lee de `localDB.tickets`
- **Test manual offline crítico:**
  1. DevTools → Network → Offline
  2. Crear FUI completa → debe mostrarse inmediatamente con número `OFFLINE-...`
  3. DevTools → Application → IndexedDB → ver el ticket en `tickets` y la operación pendiente en `syncQueue`
  4. Network → Online → en <5s el badge cambia a "sincronizado", el `ticket_number` se actualiza al definitivo
  5. Verificar en Supabase Table Editor que el ticket existe con número `MED-2026-XXXX`

**Commit:** `feat(tickets): offline-first FUI form with provisional ticket numbers`

---

## 5. SPRINT 3 — DIAGNÓSTICO + IA + KANBAN (Días 8–10)

### DÍA 8 — Checklist 39 puntos OFFLINE
**Objetivo:** Componente más complejo del sistema, funcionando 100% offline con auto-save local.
- **Prompt #14:** `DiagnosticChecklist` completo — 39 pasos, auto-save vía `useOfflineTicket().updateDiagnostic(...)` con debounce 2s
- **Prompt #15:** `diagnostic-config.ts` con la tabla completa de los 39 pasos (sección 6 del contexto)
- **Test manual offline:**
  1. Asignar ticket a `diag_tech` desde supervisor
  2. Login como `diag_tech` en otra ventana / dispositivo
  3. Network → Offline
  4. Llenar 10 pasos con detalles → al final cerrar pestaña
  5. Reabrir pestaña offline → los 10 pasos siguen ahí
  6. Network → Online → sync automático visible

**Commit:** `feat(diagnostic): 39-point checklist with offline auto-save`

---

### DÍA 9 — PDF informe (frontend) + Agente IA
**Objetivo:** Informe PDF generable offline + integración Claude para borrador.
- **Prompt #16:** Componente `<DiagnosticReportPDF />` con `@react-pdf/renderer` — funciona offline desde IndexedDB
- **Prompt #17:** Módulo `ai-agents` en Hono (Claude API) + endpoint generate/approve report
- **Test manual:**
  1. Offline: descargar PDF del informe → debe funcionar
  2. Online: supervisor genera borrador IA → revisa → aprueba → estado cambia a `INFORME_APROBADO`

**Commit:** `feat(ai,reports): claude report agent + react-pdf frontend`

---

### DÍA 10 — Kanban Realtime + TV Display + Tests
**Objetivo:** Vista en tiempo real del flujo, pantalla pública para taller, tests de integración.
- **Prompt #18:** Kanban con drag&drop (`@hello-pangea/dnd`) + Supabase Realtime + indicador de tickets provisionales
- **Prompt #19:** Vista TV pública `/display` (sin login, auto-refresh 30s)
- **Prompt #20:** Tests críticos (auth, state machine, RLS isolation, sync queue)
- **Test manual final:** Flujo completo de la sección 7 de este documento (checklist demo Medplan).

**Commit:** `feat(kanban,tests): realtime kanban + tv display + integration tests`

---

## 6. CRITERIOS DE "PRODUCCIÓN" (NO MAQUETA)

Antes de marcar cualquier módulo como listo, debe cumplir:

### Seguridad
- [ ] RLS activo y validado con prueba cross-tenant (usuario tenant A NO ve datos de tenant B → array vacío, no 403)
- [ ] Validación con Zod en TODOS los endpoints
- [ ] Ninguna mutación (POST/PATCH) ejecutada directamente desde el browser a Supabase — todo pasa por Hono
- [ ] `ticket_logs` NO insertable desde el cliente (RLS bloquea)
- [ ] `tenants` y `profiles` (INSERT) NO mutables desde el cliente
- [ ] `SERVICE_ROLE_KEY` jamás aparece en código `'use client'` o `NEXT_PUBLIC_*`

### Calidad de código
- [ ] TypeScript sin `any` ni errores de compilación
- [ ] Manejo de errores: no crashes, mensajes claros, formato `ApiError` estándar
- [ ] Loading states en la UI (no pantallas en blanco)
- [ ] Las 4 reglas de Cursor están activas en `.cursor/rules/`

### Offline-first (NUEVO — no negociable)
- [ ] Crear FUI offline → ticket aparece local → sincroniza solo al reconectar
- [ ] Completar diagnóstico offline → datos persisten tras cerrar/abrir browser
- [ ] Cambio de estado offline → se encola → se aplica al reconectar
- [ ] El indicador de estado de red y sync queue es visible siempre en el layout
- [ ] Service Worker registrado y precachando assets en producción
- [ ] Cache de referencias (clients, branches, device_models) hidratado al login

### Datos
- [ ] Trigger `validate_ticket_equipment_tenant` activo y validado
- [ ] Soft delete: ningún `DELETE` real en `tickets`, `ticket_logs`, `ticket_parts`
- [ ] Precios calculados con `decimal.js`, nunca con `Number`

### Integración
- [ ] Al menos un flujo completo probado de punta a punta por módulo
- [ ] Test de integración offline → online → sync exitoso

---

## 7. CHECKLIST FINAL DE MVP PRESENTABLE

Al terminar el Día 10, el sistema debe demostrar este flujo completo:

```
1. ✅ Supervisor login → Kanban vacío
2. ✅ Supervisor (offline) crea FUI para Olympus GIF-H190 / RedSalud Temuco
   → Ticket aparece con número OFFLINE-YYYYMMDD-001
3. ✅ Supervisor reconecta → ticket_number cambia a MED-2026-0001 (visible en UI)
4. ✅ Supervisor asigna Carlos Muñoz (diag_tech)
5. ✅ Carlos login en tablet → ve ticket asignado en lista offline-cached
6. ✅ Carlos pone tablet en modo avión
7. ✅ Carlos completa los 39 puntos (2 CRÍTICOS, 3 NO CRÍTICOS) — auto-save local
8. ✅ Carlos descarga PDF del informe (offline) y lo exporta vía pendrive
9. ✅ Carlos reconecta tablet → diagnóstico sincroniza → estado PENDIENTE_REVISION
10. ✅ Supervisor genera informe IA (online) → revisa → aprueba → INFORME_APROBADO
11. ✅ Supervisor ve el movimiento en tiempo real en Kanban
12. ✅ Pantalla TV del taller muestra el estado actualizado sin login
```

Si ese flujo funciona sin crashes ni pérdida de datos, el MVP está listo para presentar a Medplan.

---

## 8. PROMPTS DE IA — LISTOS PARA CURSOR/CLAUDE CODE

> **Instrucción de uso (siempre):**
> 1. Adjuntar al chat: `FLUCORE_AI_CONTEXT_v2.2.md` + el archivo específico del día.
> 2. Verificar que las cursor rules están activas (`flucore-core`, `flucore-typescript`, `flucore-sql`, `flucore-offline`).
> 3. Copiar el prompt completo tal cual.
> 4. Al terminar: validar el test manual ANTES de hacer commit.

---

### PROMPT #1 — Monorepo base (Día 1)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md (contenido v2.3) y FLUCORE_OFFLINE_ARCH.md.

CONTEXTO IMPORTANTE — archivos que YA EXISTEN y NO debes modificar:
- /001_core_schema_1.sql
- /supabase/migrations/003_offline_sync_support.sql
- /packages/offline/ (paquete @flucore/offline implementado completo)
- /.cursor/rules/*.mdc (4 reglas)
- /FLUCORE_*.md (5 documentos maestros)

Trabajamos directamente en la raíz del repo (NO crear subcarpeta /flucore).

TAREA: Inicializar el monorepo COMPLETANDO la estructura:

  /apps
    /web   → Next.js 14 con App Router, TypeScript strict (CREAR)
    /api   → Hono con Node.js, TypeScript strict (CREAR)
  /packages
    /offline → YA EXISTE — solo declarar como workspace, NO modificar
    /types   → CREAR
    /utils   → CREAR
  /supabase/migrations → YA EXISTE

REQUISITOS:

1. /package.json RAÍZ (workspace root):
   - "workspaces": ["apps/*", "packages/*"]
   - Scripts: dev:web, dev:api, dev (concurrently), typecheck, lint, build
   - DevDep: concurrently

2. Ambas apps con tsconfig:
   { "strict": true, "noImplicitAny": true, "noUncheckedIndexedAccess": true,
     "esModuleInterop": true, "moduleResolution": "bundler", "target": "ES2022" }

3. /apps/web — Next.js 14:
   Dependencias:
   - @supabase/ssr, @supabase/supabase-js
   - @tanstack/react-query
   - zod, react-hook-form, @hookform/resolvers
   - date-fns, decimal.js
   - dexie, dexie-react-hooks
   - next-pwa
   - @react-pdf/renderer
   - qrcode, @types/qrcode
   - @hello-pangea/dnd
   - @flucore/offline (workspace:*)
   - @flucore/types (workspace:*), @flucore/utils (workspace:*)
   Inicializar shadcn/ui: npx shadcn-ui@latest init (NO instalar componentes aún)
   Configurar next-pwa en next.config.js excluyendo /api y /auth/callback del precache.

4. /apps/api — Hono:
   Dependencias: hono, @hono/node-server, @supabase/supabase-js, zod, decimal.js,
                 @flucore/types (workspace:*)
   DevDep: tsx, @types/node, vitest

5. /packages/types — package.json name "@flucore/types":
   - ticket.types.ts (Ticket, TicketStatus enum, CreateTicketDto, UpdateDiagnosticDto)
   - diagnostic.types.ts (DiagnosticData, DiagnosticStep — sección 6 del contexto)
   - user.types.ts (UserRole enum, Profile)
   - api.types.ts (ApiSuccess<T>, ApiError — sección 8/10 del contexto)
   - index.ts con re-exports

6. /packages/utils — package.json name "@flucore/utils":
   - storage-path.ts con buildStoragePath() del contexto sección 5
   - index.ts con re-exports

7. Variables de entorno:
   - /.env.example con TODAS las variables del contexto sección 2
   - /apps/web/.env.local (vacío, comentado para que el usuario llene)
   - /apps/api/.env (vacío, comentado)
   - Verificar /.gitignore: .env, .env.local, node_modules, .next, dist, *.tsbuildinfo

8. Archivos base:
   - /apps/api/src/index.ts: servidor Hono con GET /health → {"status":"ok"}
   - /apps/web/lib/supabase/server.ts y client.ts EXACTAMENTE como sección 4 del contexto
   - /apps/web/app/layout.tsx mínimo
   - /apps/web/app/page.tsx con texto "FluCore" centrado
   - /apps/web/next.config.js con next-pwa configurado

9. Railway config futura:
   - /apps/api/railway.toml con la configuración de FLUCORE_TECH_STACK.md sección 3

NO HACER:
- No modificar /packages/offline/, /supabase/, /.cursor/rules/, /FLUCORE_*.md, /001_core_schema_1.sql
- No crear UI ni componentes shadcn aún
- No instalar Turborepo

OUTPUT FINAL:
1. Mostrar árbol de carpetas creado
2. `npm run typecheck` pasa en ambas apps
3. `npm run dev:api` levanta y GET /health responde
4. `npm run dev:web` levanta sin errores en localhost:3000
```

---

### PROMPT #2 — JWT Hook + helpers SQL (Día 0)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md secciones 5 y 9.

Crea el archivo /supabase/migrations/002_auth_hook.sql con:

1. Función public.custom_access_token_hook(event JSONB) RETURNS JSONB
   - Lenguaje plpgsql, SECURITY DEFINER
   - Lee profiles WHERE id = (event ->> 'user_id')::uuid
   - Inyecta en event['claims']: 'tenant_id' (UUID como string) y 'role' (user_role como string)
   - Si no existe el perfil, retornar event sin modificar (NO crashear)
   - GRANT EXECUTE ON FUNCTION ... TO supabase_auth_admin
   - REVOKE EXECUTE ON FUNCTION ... FROM authenticated, anon, public

2. Función update_updated_at() trigger genérico (si no está ya en 001)

3. Política RLS de storage SI no está incluida ya en 001:
   CREATE POLICY "tenant_storage_isolation" ON storage.objects
     FOR ALL USING (
       bucket_id = 'flucore-vault'
       AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
     );

Output: un solo archivo SQL listo para ejecutar en Supabase SQL Editor después de 001_core_schema_1.sql y antes de 003_offline_sync_support.sql.

POST-EJECUCIÓN MANUAL (documentar como comentario al final del SQL):
-- 1. Authentication → Hooks → Custom Access Token → seleccionar custom_access_token_hook
-- 2. Crear usuario test, hacer login, decodificar JWT, verificar que tiene tenant_id y role
```

---

### PROMPT #3 — Hono base + middleware auth (Día 2)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md secciones 4, 9, 10.

En /apps/api/src construye:

1. MIDDLEWARE AUTH (src/middleware/auth.middleware.ts):
   - Extraer Bearer token del header Authorization
   - Verificar JWT con createClient(SUPABASE_URL, SERVICE_ROLE_KEY) y supabase.auth.getUser(token)
     ⚠️ El backend SIEMPRE usa SERVICE_ROLE_KEY, NUNCA ANON_KEY
   - Leer tenant_id y role desde el JWT claims (inyectados por custom_access_token_hook)
   - Inyectar c.set('user', { id, email, tenant_id, role })
   - Si token inválido/ausente: 401 con formato ApiError
   - Tipado estricto: interface AuthUser + extender Variables del contexto Hono

2. MIDDLEWARE ERRORES (src/middleware/error.middleware.ts):
   - Captura errores no controlados → log con timestamp
   - Errores de Zod → 422 con detalles de validación
   - Otros errores → 500 con código UNHANDLED (NO exponer stack en producción)
   - Siempre retorna formato ApiError

3. APP PRINCIPAL (src/index.ts):
   - Montar middlewares globales
   - GET /health (público) → {status:"ok"}
   - GET /api/v1/me (protegido) → perfil del usuario desde profiles
   - CORS para http://localhost:3000 + NEXT_PUBLIC_APP_URL en producción

4. TIPOS (src/types/hono.types.ts):
   - Variables del contexto Hono tipadas

Validar con Zod cualquier input. Formato respuesta ApiSuccess/ApiError siempre.
```

---

### PROMPT #4 — Módulo IAM completo (Día 2)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md secciones 1, 9, 10.

Construye /apps/api/src/modules/iam/ con estructura modular estándar:

  iam.types.ts          → CreateProfileDto, UpdateProfileDto (Zod schemas)
  iam.service.ts        → interface IIamService
  iam.service.impl.ts
  iam.router.ts
  handlers/
    get-profile.handler.ts
    list-profiles.handler.ts     → admin/manager/supervisor
    create-profile.handler.ts    → solo admin
    update-profile.handler.ts

ENDPOINTS:
  GET    /api/v1/profiles/me           cualquier rol
  GET    /api/v1/profiles              admin, manager, supervisor
  GET    /api/v1/profiles/:id          admin, manager
  POST   /api/v1/profiles              admin
  PATCH  /api/v1/profiles/:id          admin o el propio usuario

REGLAS DE NEGOCIO:
- SIEMPRE filtrar por tenant_id del JWT
- Validar permisos por role ANTES de query
- Al crear: supabase.auth.admin.createUser() + insertar profile (en transacción si Supabase lo permite)
- Soft delete: PATCH { is_active: false }, nunca DELETE
- Retornar formato ApiSuccess/ApiError estándar
```

---

### PROMPT #5 — Next.js base + clientes Supabase + offline init (Día 3)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md secciones 4 y 13. Lee FLUCORE_OFFLINE_ARCH.md.

En /apps/web configura:

1. CLIENTES SUPABASE:
   - /lib/supabase/server.ts → EXACTAMENTE como sección 4 del contexto
   - /lib/supabase/client.ts → EXACTAMENTE como sección 4 del contexto
   - /lib/supabase/middleware.ts → refreshSession con @supabase/ssr

2. MIDDLEWARE NEXT.JS (middleware.ts en raíz de /apps/web):
   - Refrescar sesión en cada request
   - Redirigir a /login si no autenticado y la ruta es protegida
   - Rutas públicas: /login, /auth/callback, /display (TV)

3. LAYOUT RAÍZ (app/layout.tsx):
   - Provider de React Query
   - Font: IBM Plex Sans (NO Inter, NO Roboto)
   - Metadata: title "FluCore | Medplan"

4. LAYOUT PROTEGIDO (app/(dashboard)/layout.tsx):
   - Sidebar con navegación condicionada por role
   - Header con nombre usuario, logout, indicador de red, badge sync queue
   - Client Component que:
     a) Llama a initSyncEngine(getAccessToken) en useEffect (una sola vez)
     b) Renderiza <NetworkStatusIndicator /> usando useNetworkStatus()
     c) Renderiza <SyncStatusBadge /> usando useSyncStatus()
     d) Hidrata cache de referencias (hydrateReferenceCache) la primera vez
   - Importar todo desde @flucore/offline

5. CLIENTE API (lib/api/client.ts):
   - Función fetchApi() base que:
     a) Obtiene token de sesión Supabase
     b) Header Authorization: Bearer
     c) Apunta a NEXT_PUBLIC_API_URL
     d) Maneja errores con formato ApiError
   - getAccessToken() helper exportado para pasar al sync engine

6. COMPONENTES UI:
   - components/network/NetworkStatusIndicator.tsx
   - components/sync/SyncStatusBadge.tsx (muestra "OK" / "N pendientes" / "M fallidas")
   - Botón "Reintentar todo" si hay fallidas

NO crear páginas de contenido todavía. Solo infraestructura base + offline init.
```

---

### PROMPT #6 — Auth flow + dashboard base (Día 3)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md.

Crea el flujo de autenticación en /apps/web:

1. /app/(auth)/login/page.tsx:
   - Diseño industrial/médico, azul profundo o gris oscuro (NO gradientes purple)
   - Logo "FluCore" + subtexto "Medplan Service Platform"
   - Form: email + password con validación Zod via react-hook-form
   - Loading state + error visible
   - createSupabaseBrowserClient().auth.signInWithPassword()
   - Tras login exitoso: router.push('/dashboard')

2. /app/auth/callback/route.ts:
   - Route Handler intercambia code por sesión
   - Redirige a /dashboard si OK, /login?error=... si falla

3. /app/(dashboard)/dashboard/page.tsx:
   - Server Component
   - Lee sesión + perfil + tenant
   - Mensaje bienvenida + nombre + rol + tenant
   - Indicador prominente: "Sistema operando offline" si applies (Client Component child con useNetworkStatus)

4. Logout: botón en Header llama signOut() y redirige a /login.

El login es lo primero que ven los técnicos cada día — debe ser limpio, profesional y memorable.
```

---

### PROMPT #7 — Seed Medplan (Día 4)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md y 001_core_schema_1.sql.

Crea /supabase/migrations/004_medplan_seed.sql con:

1. Tenant Medplan: usar UUID fijo del schema (00000000-0000-0000-0000-000000000001)

2. Cliente "Empresas RedSalud S.A." con 3 sucursales:
   - Clínica RedSalud Mayor Santiago (factura con RUT matriz)
   - Clínica RedSalud Temuco (RUT propio)
   - Clínica RedSalud Concepción (RUT propio)

3. device_models — los del schema + agregar:
   - Olympus: GIF-XQ200, CF-HQ290L, PCF-H190L (pediátrico)
   - Fuji: EG-760R, EC-760R-V/L
   - Pentax: EG-3490K

4. Usuarios iniciales (insertar en auth.users Y en profiles, UUIDs fijos):
   - admin@medplan.cl / Admin2025!
   - supervisor@medplan.cl / Super2025!
   - diag1@medplan.cl / Diag2025!  (Carlos Muñoz)
   - repair1@medplan.cl / Repair2025! (Pedro Soto)

5. Equipo ejemplo: Olympus GIF-H190 SN123456 → RedSalud Mayor, QR "FLUCORE-MED-SN123456"

USAR INSERT ON CONFLICT DO NOTHING (idempotente).
PASSWORDS: usar crypt() de pgcrypto. Si el ambiente no lo permite, agregar comentario indicando crear vía Supabase Dashboard.
```

---

### PROMPT #8 — Admin panel usuarios (Día 4)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md.

Crea /apps/web/app/(dashboard)/admin/users/page.tsx (Server Component):
- Lista todos los profiles del tenant (Supabase server-side)
- Botón "Crear usuario" abre modal/dialog (Client Component)
- Form: email + nombre + role (select de UserRole) + password inicial
- Submit llama POST /api/v1/profiles via fetchApi()
- Tras éxito: revalidate la página
- Soft delete: botón "Desactivar" llama PATCH con is_active:false

Permisos: solo admin puede acceder (validar en Server Component leyendo el JWT del usuario actual y haciendo redirect si no aplica).

UI: tabla con shadcn/ui (Table, Dialog, Form, Select, Button).
```

---

### PROMPT #9 — Backend equipment + clients + branches (Día 5)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md.

Crea 3 módulos backend en /apps/api/src/modules/:

  /equipment   → POST, PATCH (incluye soft delete)
  /clients     → POST, PATCH
  /branches    → POST, PATCH

NOTA: Los GET se hacen directo desde Supabase con server.ts client (CQRS-Lite).
El backend SOLO maneja mutaciones.

ENDPOINTS:
  POST  /api/v1/equipment              supervisor, manager, admin
  PATCH /api/v1/equipment/:id          supervisor, manager, admin
  POST  /api/v1/clients                supervisor, manager, admin
  PATCH /api/v1/clients/:id            supervisor, manager, admin
  POST  /api/v1/branches               supervisor, manager, admin
  PATCH /api/v1/branches/:id           supervisor, manager, admin

REGLAS:
- Validación Zod en cada DTO
- Filtrar tenant_id por JWT
- Trigger SQL valida cross-tenant (equipment.tenant_id = ticket.tenant_id ya está)
- Soft delete: is_active = false (NO DELETE)
- Formato ApiSuccess/ApiError
```

---

### PROMPT #10 — Frontend equipment con offline cache (Día 5)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md y FLUCORE_OFFLINE_ARCH.md sección "reference cache".

En /apps/web crea:

1. /app/(dashboard)/equipment/page.tsx — Server Component
   - Lee equipment + device_models + clients + branches con Supabase server.ts
   - Renderiza tabla con shadcn/ui

2. /app/(dashboard)/equipment/new/page.tsx — Client Component
   - Form react-hook-form + Zod
   - Selects de device_models, clients, branches LEEN PRIMERO de localDB
     (useLiveQuery de @flucore/offline) y como fallback de Supabase
   - Submit → fetchApi POST /api/v1/equipment
   - Tras éxito: actualizar localDB.equipment cache

3. components/equipment/EquipmentSearch.tsx
   - Input con autocomplete por número de serie
   - Busca primero en localDB.equipment, luego en Supabase si online
   - Debounce 300ms

4. Hidratación inicial:
   - Al login (en layout protegido): hydrateReferenceCache(supabase, tenantId)
     trae device_models, clients, branches y los guarda en IndexedDB
   - Reintenta cada 30 min cuando hay red

DISEÑO: tabla densa, shadcn/ui Table + Filter + Pagination.
```

---

### PROMPT #11 — Backend tickets + state machine + offline support (Día 6)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md secciones 6, 7 y 13. Lee 001_core_schema_1.sql.
Lee 003_offline_sync_support.sql para entender provisional ticket numbers.

Construye /apps/api/src/modules/tickets/:

  ticket.types.ts
  ticket.service.ts
  ticket.service.impl.ts
  ticket.router.ts
  ticket.state-machine.ts
  handlers/
    create-ticket.handler.ts
    get-ticket.handler.ts
    list-tickets.handler.ts
    update-status.handler.ts
    update-diagnostic.handler.ts
    assign-tech.handler.ts

ENDPOINTS:
  POST  /api/v1/tickets                       crear FUI
  GET   /api/v1/tickets                       listar con filtros (status, assigned_to, dates)
  GET   /api/v1/tickets/:id                   detalle con joins
  PATCH /api/v1/tickets/:id/status            cambio de estado (validar máquina)
  PATCH /api/v1/tickets/:id/diagnostic        actualizar diagnostic_data JSONB
  PATCH /api/v1/tickets/:id/assign            asignar técnico

STATE MACHINE (ticket.state-machine.ts):
- Implementar tabla de transiciones de la sección 7 del contexto
- validateTransition(from, to, userRole): boolean
- Si inválida → INVALID_TRANSITION (422)
- Si rol sin permiso → FORBIDDEN (403)

CRÍTICO en update-status.handler.ts:
1. Validar transición
2. Update tickets.status + fecha correspondiente (diagnosed_at, repaired_at, etc.)
3. INSERT en ticket_logs (NUNCA omitir — es la auditoría)
4. Retornar ticket actualizado

⚠️ SOPORTE OFFLINE en create-ticket.handler.ts:
- Aceptar tickets con ticket_number = "OFFLINE-..." (el trigger SQL lo reemplaza)
- Aceptar campo opcional _client_updated_at (TIMESTAMPTZ) y guardarlo
- Aceptar campo opcional sync_origin (default 'online'; los offline llegan con 'offline_sync')

⚠️ CONFLICT DETECTION en update-*:
- Si NEW._client_updated_at < EXISTING._client_updated_at → ignorar (last-write-wins)
- Loggear como conflict resolution en ticket_logs

Validaciones Zod para cada DTO. diagnostic_data validar contra DiagnosticData de @flucore/types.
```

---

### PROMPT #12 — FUI Form OFFLINE-FIRST (Día 7)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md y FLUCORE_OFFLINE_ARCH.md secciones 7 y 8.

Crea /apps/web/app/(dashboard)/tickets/new/page.tsx (Client Component):

DISEÑO:
- Wizard de 3 pasos limpio, denso, industrial:
  PASO 1: Datos del Equipo (search + create inline)
  PASO 2: Datos de Recepción (accesorios, comentarios cliente)
  PASO 3: Asignación + confirmación

REGLA CRÍTICA — NO USAR fetchApi DIRECTAMENTE:
Para crear el ticket usar el hook del paquete offline:
  const { createTicket } = useOfflineTicket(getAccessToken)
  const result = await createTicket({ equipment_id, client_request, ... })
  // result.ticket_number puede ser "OFFLINE-YYYYMMDD-XXX" si está sin red
  // El sync engine lo sincroniza solo al reconectar

COMPONENTES:
1. EquipmentSearch: input búsqueda con autocomplete
   - Busca primero localDB.equipment (useLiveQuery)
   - Fallback a Supabase server-side si online
   - Debounce 300ms

2. FUIForm: react-hook-form + Zod
   - Selects de clients/branches/device_models leen de localDB
   - Campo "Recibido con accesorios": checkbox + textarea condicional
   - Campo "Pedido del cliente": textarea (mínimo 10 chars)

3. FUIPreview: resumen pre-confirmación

DESPUÉS DE CREAR:
- Redirigir a /tickets/[ticket_number] (puede ser provisional)
- Mostrar QR (qrcode lib) → descargable PNG
- Mostrar banner: "Ticket creado offline. Se sincronizará automáticamente al reconectar."
  si _provisional === true

shadcn/ui base. Loading states + error handling visible.
```

---

### PROMPT #13 — Detalle ticket + QR (Día 7)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md sección 5.

Crea /apps/web/app/(dashboard)/tickets/[ticketId]/page.tsx:

- Layout: información del ticket + equipo + cliente + estado actual + acciones
- Lee primero de localDB.tickets (useLiveQuery), fallback a Supabase si no está
- Mostrar timeline de ticket_logs (Supabase directo)
- QR del equipo (qrcode), descargable PNG
- Si _provisional === true: badge "Pendiente sync"
- Botones de acción condicionados por role:
  - Supervisor: "Asignar técnico", "Aprobar informe"
  - diag_tech (solo si asignado): "Iniciar diagnóstico" → /diagnostic
  - repair_tech (solo si asignado y estado = OT_GENERADA): "Iniciar reparación"

Todas las acciones de cambio de estado pasan por useOfflineTicket().changeStatus(...).

shadcn/ui Card, Badge, Button, Tabs (info/timeline/photos).
```

---

### PROMPT #14 — Checklist 39 puntos OFFLINE-FIRST (Día 8)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md SECCIÓN 6 COMPLETA (la tabla de los 39 pasos es vital).
Lee FLUCORE_OFFLINE_ARCH.md.

ESTE ES EL COMPONENTE MÁS CRÍTICO DEL SISTEMA.

Crea /apps/web/components/diagnostic/DiagnosticChecklist.tsx:

DISEÑO:
- Tabla con columnas: Nº | Área | OK | NoCrítico | Crítico | PedidoUsuario | NoAplica | Detalles | Comentarios
- Cada fila = un paso de inspección
- Radiobuttons coloreados: verde=OK, amarillo=NoCrítico, rojo=Crítico
- Mobile/tablet: diseño adaptado para touch (las tablets de diag son el ambiente real)

COMPORTAMIENTO POR PASO:
- Al seleccionar status ≠ OK y ≠ NoAplica → mostrar checkboxes de Detalles específicos del paso
- Pasos con valores numéricos (8, 9: MΩ; 20, 23: %; 33: U/D/R/L) → inputs numéricos
- Paso 6 (botones): checkboxes con teclas 1-4
- Cada paso tiene textarea de comentarios (colapsada por defecto)

ESTADO Y GUARDADO — OFFLINE-FIRST:
- useReducer para 39 pasos (NO 39 useState)
- Auto-save con debounce 2s vía:
    const { updateDiagnostic } = useOfflineTicket(getAccessToken)
    await updateDiagnostic(ticketId, partialDiagnosticData)
  Esto guarda en IndexedDB INMEDIATO y encola para sync.
- Indicador "Guardado local" / "Sincronizado" / "Pendiente sync" / "Error"
- Al completar todos los pasos: habilitar botón "Enviar a Revisión"
  → llama useOfflineTicket().changeStatus(ticketId, 'PENDIENTE_REVISION')

ESTRUCTURA DATOS:
DiagnosticData de @flucore/types/diagnostic.types.ts (sección 6.4 contexto)

PROPS:
interface DiagnosticChecklistProps {
  ticketId: string
  initialData: Partial<DiagnosticData>
  readOnly?: boolean
  onComplete?: () => void
}

Crear también: /apps/web/lib/diagnostic-config.ts
- Configuración de los 39 pasos: nombre, opciones de detalle, tipo de extras
- Basarse en la tabla COMPLETA del contexto sección 6.4
```

---

### PROMPT #15 — diagnostic-config.ts (Día 8, complemento)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md sección 6 — la tabla completa de los 39 pasos.

Genera el archivo /apps/web/lib/diagnostic-config.ts que exporta:

export const DIAGNOSTIC_STEPS = [
  {
    id: 'step_01_exera_id',
    number: 1,
    area: 'Identificación EXERA',
    detailOptions: [...],   // checkboxes específicos del paso 1
    extraFields: null
  },
  {
    id: 'step_08_aislamiento_canal',
    number: 8,
    area: 'Aislamiento canal',
    detailOptions: [...],
    extraFields: { type: 'numeric', unit: 'MΩ', label: 'Resistencia' }
  },
  // ... 39 entradas en total, una por paso
]

export type DiagnosticStepConfig = (typeof DIAGNOSTIC_STEPS)[number]

Mantener el orden y nombres EXACTOS del formulario físico de Medplan.
Si algún paso no tiene detailOptions claros en el contexto, dejarlo como [] y comentar "PENDIENTE: confirmar con Medplan".
```

---

### PROMPT #16 — PDF informe técnico frontend (Día 9)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md y FLUCORE_TECH_STACK.md sección 5 (decisión @react-pdf/renderer).

Crea /apps/web/components/reports/DiagnosticReportPDF.tsx (Client Component):

import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer'

CONTENIDO DEL PDF (1-2 páginas):
1. Header: logo Medplan + N° de ticket + fecha
2. Datos equipo: marca, modelo, serie, cliente, sucursal
3. Resumen ejecutivo: contar pasos por status (X CRÍTICO, Y NO_CRÍTICO, etc.)
4. Sección "Hallazgos críticos": lista pasos con status=CRITICO + detalles + valores + comentarios
5. Sección "Hallazgos no críticos": ídem con status=NO_CRITICO
6. Sección "Resumen pasos OK": lista breve
7. Footer: técnico responsable + firma digital (texto)

ESTILO:
- Estética técnica/industrial: tipografía sans-serif, tablas con bordes finos, headers grises
- Colores: rojo para CRÍTICO, amarillo para NO_CRÍTICO, verde para OK
- A4, márgenes 2cm

Crear /apps/web/components/reports/PdfDownloadButton.tsx:
import { PDFDownloadLink } from '@react-pdf/renderer'

<PDFDownloadLink
  document={<DiagnosticReportPDF ticket={localTicket} />}
  fileName={`${ticket.ticket_number}_informe_tecnico.pdf`}
>
  {({ loading }) => loading ? 'Generando...' : 'Descargar PDF'}
</PDFDownloadLink>

⚠️ IMPORTANTE: este botón debe poder funcionar OFFLINE.
El componente DiagnosticReportPDF debe leer el ticket desde localDB (useLiveQuery)
para que funcione sin red. NO depender de fetchApi ni Supabase para renderizar.

Integrar el botón en la página de detalle del ticket cuando status >= PENDIENTE_REVISION.
```

---

### PROMPT #17 — Agente IA Claude (Día 9)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md SECCIÓN 8 COMPLETA.

Crea /apps/api/src/modules/ai-agents/:

  ai-agents.types.ts
  providers/
    provider.interface.ts        → interface ILLMProvider intercambiable
    anthropic.provider.ts        → implementación Claude (fetch nativo, sin SDK)
  report-generator.service.ts
  handlers/
    generate-report.handler.ts
    approve-report.handler.ts

GENERATE (POST /api/v1/tickets/:id/generate-report):
- Solo supervisor, manager
- Validar ticket en estado PENDIENTE_REVISION
- Validar diagnostic_data completo (todos los 39 pasos con status)
- Construir prompt con buildReportPrompt(ticket, equipment, client):
  * System prompt EXACTO del contexto sección 8
  * JSONB → texto estructurado: primero CRÍTICOS, luego NO_CRÍTICOS, luego resto
  * Datos del equipo: marca, modelo, serie, cliente, sucursal
- Llamar Claude API: claude-sonnet-4-20250514, max_tokens 2000
- Guardar en tickets.ai_report_draft
- NO cambiar estado (espera aprobación manual)
- Retornar borrador

APPROVE (PATCH /api/v1/tickets/:id/approve-report):
- Solo supervisor, manager
- Body: { ai_report_final: string }  // puede ser draft editado
- Update tickets: ai_report_final, report_approved_at, report_approved_by
- Status → INFORME_APROBADO
- Insert en ticket_logs
- Retornar ticket

ANTHROPIC PROVIDER:
- fetch nativo (no @anthropic-ai/sdk — minimizar deps)
- Header x-api-key: process.env.ANTHROPIC_API_KEY
- Retry exponencial: 1s, 2s, 4s (máx 3 intentos) en 429 / 5xx
- Timeout 30s

⚠️ Este endpoint requiere red. NO encolar offline — si está sin red, mostrar mensaje en UI.
```

---

### PROMPT #18 — Kanban + Realtime + sync indicators (Día 10)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md.

Crea /apps/web/app/(dashboard)/dashboard/page.tsx:

DISEÑO:
- Kanban horizontal con una columna por estado de ticket_status
- Colores por fase: azul (diagnóstico), amarillo (espera), verde (reparación), gris (cerrado)
- Tarjetas: número de ticket, equipo, cliente, días desde ingreso
- Tarjetas CRÍTICAS (algún paso con status=CRITICO): borde rojo
- Tarjetas PROVISIONALES (_provisional=true desde localDB): badge "Pendiente sync"
- Drag & drop con @hello-pangea/dnd
- Contador de tickets por columna en headers

DATOS:
- Server Component carga inicial (Supabase server.ts directo)
- Client Component child se suscribe a Supabase Realtime:
    supabase.channel('tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, handler)
      .subscribe()
- También se suscribe a localDB.tickets via useLiveQuery para mostrar tickets offline aún no sincronizados

DRAG & DROP:
- onDragEnd → useOfflineTicket().changeStatus(ticketId, newStatus)
- Si la transición es inválida (validar con la state machine local antes de enviar):
  revertir con animación de rebote + toast con mensaje del backend

INDICADOR SYNC GLOBAL en header del Kanban:
- Si syncQueue.pending > 0 → "N operaciones pendientes" con botón "Sincronizar ahora"
- Si syncQueue.failed > 0 → "M operaciones fallidas" en rojo con botón "Reintentar"
```

---

### PROMPT #19 — Vista TV pública (Día 10)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md.

Crea /apps/web/app/display/page.tsx:

CARACTERÍSTICAS:
- NO requiere autenticación (agregar /display a rutas públicas en middleware.ts)
- Sin sidebar ni controles, solo lectura
- Auto-refresh cada 30s (NO Realtime para simplicidad)
- Fuente grande, alto contraste, legible a 3-5 metros
- Mostrar tickets activos (excluir CERRADA y CANCELADA)
- Filtrar por tenant_id mediante un parámetro de URL: /display?tenant=medplan
  (en producción usar un token público específico de tenant)

DISEÑO:
- Tema oscuro, fuente IBM Plex Mono o tipográfica industrial
- 3 columnas grandes: "EN DIAGNÓSTICO" / "EN REPARACIÓN" / "PARA ENTREGAR"
- Cada tarjeta: N° ticket grande, equipo, sucursal, días en proceso
- Reloj en esquina superior derecha
- Logo Medplan en esquina superior izquierda

DATOS:
- Server Component con Supabase server.ts (sin sesión, usa anon key + policy pública específica)
- O bien, endpoint Hono público GET /api/v1/public/tickets?tenant_slug=medplan
  que retorna solo info no-sensible (sin diagnostic_data ni ai_report)

⚠️ PRIVACIDAD: NO mostrar ningún campo sensible (diagnostic_data, ai_report, precios).
```

---

### PROMPT #20 — Tests críticos (Día 10)

```
Lee FLUCORE_AI_CONTEXT_v2.2.md.

Crea tests con Vitest en /apps/api/src/tests/:

  auth.test.ts
  ticket-state-machine.test.ts
  rls-isolation.test.ts
  offline-sync.test.ts (nuevo)

auth.test.ts:
- Request sin token → 401
- Token de tenant A NO accede a datos de tenant B → 403/array vacío
- diag_tech intentando aprobar informe → 403
- supervisor aprueba informe → 200

ticket-state-machine.test.ts:
- Todas las transiciones válidas del contexto sección 7 → pass
- Transiciones inválidas (ej: INGRESADO → CERRADA) → INVALID_TRANSITION
- repair_tech moviendo a CONTROL_CALIDAD → válido
- diag_tech moviendo a CERRADA → falla

rls-isolation.test.ts:
- Crear ticket en tenant A
- Leer con cliente de tenant B → 0 resultados (no error, prueba que RLS funciona a nivel DB)

offline-sync.test.ts (nuevo):
- POST /api/v1/tickets con ticket_number = "OFFLINE-20260501-001" → debe quedar con número definitivo MED-...
- POST con _client_updated_at antiguo → conflicto detectado, no sobreescribe
- ticket_logs registra el origen offline_sync correctamente

Cliente Supabase de test apuntando a la DB de desarrollo. Los tests pasan con `npm run test` en /apps/api.
```

---

## 9. SIGUIENTES PASOS POST-MVP

Una vez cumplido el checklist de la sección 7, las siguientes prioridades son:

1. **Cotizaciones completas** (PROMPT futuro, no incluido en plan 2 semanas)
2. **Inventario Kame + Desarme** (módulo completo)
3. **Notificaciones email** (decisión Resend vs Sendgrid pendiente)
4. **OT_GENERADA → EN_REPARACION flow completo** (repair_tech UI)
5. **Plan Supabase Pro** (si se valida MVP con Medplan)
6. **Staging environment** separado de dev

Ver `FLUCORE_RECOMMENDATIONS.md` sección 8 (Pendientes futuros).

---

## 10. ANTI-PATRONES — REVIVIDOS DEL CONTEXTO

Recordatorio para Cursor / Claude Code (la regla `flucore-core` los enforce):

```
❌ any en TypeScript
❌ SERVICE_ROLE_KEY en variables NEXT_PUBLIC_ o archivos 'use client'
❌ DELETE en tablas transaccionales (tickets, ticket_logs, ticket_parts)
❌ Hardcodear tenant_id
❌ Lógica de validación de roles en frontend (solo Hono)
❌ Pasar archivos binarios por Hono API (van directo a Supabase Storage)
❌ Un único cliente Supabase global compartido entre server y browser
❌ select * en queries de producción
❌ Crear columnas SQL para datos que pertenecen en JSONB
❌ Mutaciones desde el browser DIRECTO a Supabase (todo pasa por Hono o por @flucore/offline)
❌ fetch directo en componentes de mutación (usar siempre useOfflineTicket o sus equivalentes futuros)
❌ Cerrar sesión sin commit (lección 2026-04-26)
```

---

*Documento: FluCore Dev Plan v2.0 — Refundición offline-first*
*Versión activa de referencia: FLUCORE_AI_CONTEXT_v2.2.md (contenido v2.3)*
*Cursor rules activas: flucore-core, flucore-typescript, flucore-sql, flucore-offline*
