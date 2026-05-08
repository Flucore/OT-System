# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [0.2.0] — 2026-05-08

### Añadido

- **Web (`apps/web`):** flujo de autenticación — login, callback PKCE (`/auth/callback`), recuperación de contraseña (`/reset-password`), relay de `/?code=` en middleware.
- **Web:** layout de dashboard con sidebar, logout, `initSyncEngine`, indicadores de red y cola de sincronización (`@flucore/offline`).
- **Web:** página de dashboard con métricas de tickets (consulta server-side), accesos rápidos y botón **Nuevo FUI** (roles admin/manager/supervisor); placeholder `/tickets/new`.
- **Web:** cliente Supabase admin **solo servidor** (`lib/supabase/admin.ts`) para leer el perfil cuando RLS + JWT aún no exponen `tenant_id` (complemento al hook JWT).
- **Scripts:** `scripts/reset-next-dev.ps1` y scripts npm `dev:web:reset` / `reset:web` para Windows (puertos, caché `.next`).
- **Documentación:** `docs/HISTORIAL_DESARROLLO_FLUCORE.md`, este `CHANGELOG.md`, `SECURITY.md`, README ampliado.

### Cambiado

- **Web:** `next.config.mjs` (ESM) + Serwist compatible; Tailwind v4 (`@tailwindcss/postcss`, `@import "tailwindcss"`).
- **Web:** página raíz como relay de hash de Supabase (recovery legacy).
- **API:** validación de `id` en handlers IAM; respuestas `ok()` con `meta` opcional sin `timestamp` obligatorio en callers.
- **Offline:** firma de `processQueue` y tipos de sincronización alineados con `SyncEngineOptions` / `TicketStatus`.
- **Raíz:** `.env.example` documenta `SUPABASE_SERVICE_ROLE_KEY` opcional en Next (solo server); `.gitignore` ampliado (`.DS_Store`, `Thumbs.db`).

### Corregido

- Hydration mismatch en `NetworkStatusIndicator` y widget offline del dashboard (`navigator.onLine` vs SSR).
- `ERR_REQUIRE_ESM` al cargar `@serwist/next` desde configuración CommonJS.
- Conflictos de puerto y bloqueo de `.next/trace` en desarrollo Windows.

### Seguridad

- Variables sensibles permanecen en `.gitignore` (`apps/web/.env.local`, `apps/api/.env`). No se versionan claves ni `DATABASE_URL` reales.

### Notas

- El **seed Medplan** completo del plan (Prompt #7) puede estar aplicado solo en la instancia Supabase remota; conviene versionar `supabase/migrations/004_medplan_seed.sql` en un siguiente PR para reproducibilidad.
- **Prompt #8** (panel admin usuarios con shadcn) evaluado y **no** incluido en esta versión.

---

## [0.1.0] — estado anterior (commits base)

- Monorepo Next 15 + Hono + paquetes `types`, `utils`, `offline`.
- API: health, auth middleware, módulo IAM (perfiles CRUD).
- Migraciones SQL en repo: `002_auth_hook`, `003_offline_sync_support` (esquema core referenciado en documentación).
