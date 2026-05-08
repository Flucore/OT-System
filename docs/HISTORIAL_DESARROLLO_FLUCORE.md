# Historial de desarrollo — FluCore (OT-System)

Documento vivo de **qué está hecho**, **errores encontrados** y **cómo se resolvieron**. Útil para onboarding, auditorías y releases en GitHub.

**Última actualización:** 2026-05-08 · **Versión en repo:** `0.2.0` (ver [CHANGELOG.md](../CHANGELOG.md)).

---

## Estado actual del repositorio

| Área | Estado |
|------|--------|
| Monorepo (`apps/web`, `apps/api`, `packages/*`) | Operativo |
| Typecheck workspaces | `npm run typecheck` en verde |
| Next.js 15 (App Router) | Dev estable con `npm run dev:web:reset` (Windows) |
| Hono API | IAM + auth middleware |
| Supabase | Auth, RLS, hook JWT `custom_access_token_hook` (activar/verificar en Dashboard) |
| Seed Medplan (datos demo) | Aplicado en proyecto remoto (cliente RedSalud, sucursales, modelos extra, equipo SN123456, usuarios seed) |

---

## Cronología de problemas y soluciones

### 1. TypeScript — API IAM y tipos compartidos

**Síntomas:** `tsc` fallaba en handlers IAM (`id` posiblemente `undefined`), y en `ok()` de `@flucore/types` por `meta.timestamp` obligatorio.

**Causa:** Params de ruta tipados como opcionales; firma de `ok()` demasiado estricta para `meta`.

**Solución:** Guards tempranos `if (!id) return …` en `get-profile` y `update-profile`; `ok()` acepta `meta` sin `timestamp` (se genera dentro).

**Archivos:** `apps/api/src/modules/iam/handlers/*.ts`, `packages/types/src/api.types.ts`

---

### 2. TypeScript — paquete `@flucore/offline`

**Síntomas:** `processQueue` recibía función en lugar de objeto de opciones; cast de `status` a string vs enum.

**Solución:** Llamadas `processQueue({ getAccessToken })`; import y uso de `TicketStatus` donde corresponde.

**Archivos:** `packages/offline/src/hooks/use-sync-status.ts`, `packages/offline/src/sync-engine.ts`, `packages/offline/tsconfig.json` (nuevo)

---

### 3. Next.js + Serwist — `ERR_REQUIRE_ESM`

**Síntomas:** `require('@serwist/next')` en `next.config.js` (CJS) fallaba.

**Solución:** `next.config.mjs` con `import`; opciones no soportadas por la versión de Serwist retiradas.

---

### 4. Tailwind CSS v4 — PostCSS

**Síntomas:** Build fallaba al usar `tailwindcss` como plugin PostCSS “clásico”.

**Solución:** `@tailwindcss/postcss` en `postcss.config.js`; `@import "tailwindcss"` en `globals.css`.

---

### 5. Windows — `next dev` colgado, puertos y `EPERM` en `.next/trace`

**Síntomas:** `EADDRINUSE`, “Starting…” eterno, bloqueo de archivos bajo `apps/web/.next`, prompts de `npm.cmd` al cortar el proceso.

**Solución:** Script PowerShell `scripts/reset-next-dev.ps1` (mata procesos `next dev` del repo, libera 3000/3001, borra `.next`); scripts `dev:web:reset` / `reset:web` en `package.json`.

---

### 6. Auth en Next — rutas faltantes (`/login` 404)

**Síntomas:** Middleware redirigía a `/login` pero no existía la página (Prompts #5–#6 no estaban en el árbol commiteado).

**Solución:** `app/(auth)/login/page.tsx`, `app/auth/callback/route.ts`, layout dashboard, componentes de red/sync, middleware con `/?code=` → `/auth/callback`.

---

### 7. Recuperación de contraseña — flujo en la app

**Síntomas:** Link de Supabase llevaba a la app sin pantalla para nueva contraseña; confusión con error 520 de Cloudflare (infra Supabase, no código local).

**Solución:** `reset-password` + callback que distingue `type=recovery` / `invite`; root client relay para hash legacy; rutas públicas actualizadas.

**Nota:** Contraseña de emergencia también se puede fijar con **Admin API** (solo server / operador), nunca en el cliente.

---

### 8. React — hydration mismatch (`NetworkStatusIndicator`)

**Síntomas:** Servidor renderizaba “Sin conexión” / ámbar y el cliente “En línea” / verde (por `navigator.onLine` en el primer render del hook).

**Solución:** Estado `mounted` + placeholder neutro hasta `useEffect`; mismo patrón en widget offline del dashboard.

**Archivos:** `components/network/NetworkStatusIndicator.tsx`, `app/(dashboard)/dashboard/_components/NetworkStatusWidget.tsx`

---

### 9. Dashboard — “Sin rol” a pesar de `profiles.role`

**Síntomas:** `createSupabaseServerClient` + `.from('profiles')` devolvía vacío por RLS cuando el JWT aún no lleva `tenant_id` (hook no activo o token viejo).

**Solución:** `lib/supabase/admin.ts` con `SERVICE_ROLE_KEY` **solo en Server Components**, después de `getUser()` — lectura de perfil propio para UI (sidebar). No sustituye activar el hook para RLS del browser ni para Hono.

**Variable:** `SUPABASE_SERVICE_ROLE_KEY` en `apps/web/.env.local` (gitignored). Documentado en `.env.example`.

---

### 10. Datos — Prompt #7 (seed Medplan)

**Contenido aplicado en el proyecto Supabase (remoto):** tenant Medplan ya existía; se añadieron cliente RedSalud, tres sucursales, modelos de equipo adicionales, equipo demo SN123456, usuarios `admin@medplan.cl`, `supervisor@medplan.cl`, `diag1@medplan.cl`, `repair1@medplan.cl` con perfiles.

**Pendiente en repo:** migración SQL versionada `004_medplan_seed.sql` (el plan original la nombra así); hoy parte del seed vive solo en la base remota. Recomendación: volcar a archivo SQL idempotente para reproducibilidad entre entornos.

---

## Archivos y carpetas clave añadidos o tocados (resumen)

- `apps/web/middleware.ts` — sesión, rutas públicas, relay `?code=`
- `apps/web/app/(auth)/login/page.tsx`, `reset-password/page.tsx`
- `apps/web/app/auth/callback/route.ts`
- `apps/web/app/(dashboard)/layout.tsx`, `_components/DashboardShell.tsx`, `dashboard/page.tsx`, `tickets/new/page.tsx`
- `apps/web/lib/supabase/{server,client,middleware,admin}.ts`
- `apps/web/components/network/`, `components/sync/`
- `scripts/reset-next-dev.ps1`
- `packages/offline` — fixes TS y `tsconfig`

---

## Evaluación — Prompt #8 (Admin panel usuarios) — **no ejecutado**

**Qué pide el plan:** página server `admin/users`, tabla, modal cliente, crear usuario (email, nombre, rol, password), POST `/api/v1/profiles`, PATCH desactivar, **solo admin**, UI con **shadcn/ui**.

**Backend hoy:** existen `POST /api/v1/profiles` (solo admin), listado, PATCH con reglas por rol — alineado con la parte API.

**Brechas si se ejecuta “tal cual”:**

1. **shadcn/ui** no está instalado en `apps/web` (no hay `@radix-ui/*`, ni CLI shadcn). Hay que inicializar shadcn o **adaptar** el prompt a componentes Tailwind como el login.
2. **Permisos de página vs listado:** el plan dice “solo admin” para la página; en API el listado permite admin/manager/supervisor. Conviene **unificar criterio** (p. ej. solo admin para crear; manager solo lectura o nada).
3. **Revalidación:** tras mutación, `revalidatePath` / `router.refresh` según patrón elegido.

**Recomendación:** ejecutar Prompt #8 **después** de decidir (A) instalar shadcn en web o (B) acotar el prompt a UI sin shadcn; y de volcar el seed a `004_medplan_seed.sql` si quieres CI/staging reproducible.

---

## Checklist — preparar versión para GitHub (pre-push)

1. **`git status`** — revisar que no aparezcan `.env`, `.env.local`, `apps/api/.env`, claves en diffs.
2. **`.gitignore`** — confirma `.next`, `node_modules`, `.env*`, `apps/web/.env.local`, `apps/api/.env`.
3. **`npm run typecheck`** y, si aplica, **`npm run build`** en `apps/web`.
4. **No subir** capturas ni Markdown con **service_role**, JWT ni `DATABASE_URL` reales (rotar claves si alguna quedó en chat o en issue).
5. **Commits atómicos sugeridos:** `fix(web): hydration network indicator`, `feat(web): admin server client for profile`, `feat(web): dashboard stats and FUI placeholder`, `chore: reset script and docs historial`.
6. **Opcional:** añadir `supabase/migrations/004_medplan_seed.sql` en un PR separado para alinear DB con el plan.

---

## Hook JWT (capturas Dashboard)

Configuración esperada: **Authentication → Hooks → Customize Access Token (JWT)**, función `public.custom_access_token_hook`, habilitada, con `GRANT EXECUTE` a `supabase_auth_admin` (el SQL del dashboard coincide con `002_auth_hook.sql`).

**Verificación rápida:** tras login, decodificar el access token y confirmar claims `tenant_id` y `role`. Sin eso, el cliente anónimo/authenticated seguirá chocando con RLS aunque el server admin muestre bien el sidebar.

---

## Guía Técnica — `docs/HISTORIAL_DESARROLLO_FLUCORE.md`

**Qué hace:** Centraliza decisiones, errores resueltos y checklist de release.

**Por qué existe:** Evitar repetir debugging (hydration, Windows, auth) y alinear al plan de 2 semanas.

**Dónde se conecta:** Equipo humano + agentes IA; referencia antes de Prompt #8 y migraciones seed.

**Puntos críticos:** No pegar secretos en este archivo; el seed “solo remoto” no reemplaza SQL en repo hasta que exista la migración.

**Cómo verificarlo:** Leer la sección del error que te afecte y el checklist antes de `git push`.
