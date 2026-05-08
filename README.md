# OT-System (FluCore)

Plataforma de gestión de servicio técnico para endoscopía (Medplan): tickets, FUI (formulario único de ingreso), órdenes de trabajo y operación **offline-first** donde aplica.

**Versión documentada:** `0.2.0` (2026-05-08) — ver [CHANGELOG.md](./CHANGELOG.md).

---

## Funciones de esta versión (0.2.0)

| Área | Qué incluye |
|------|-------------|
| **Autenticación** | Login email/contraseña, callback PKCE, flujo de recuperación/invitación hacia `/reset-password`, middleware con rutas públicas y relay `/?code=`. |
| **Dashboard** | Layout con sidebar, nombre y rol (lectura server-side), estado de red y sync, métricas de tickets abiertos / en diagnóstico / pendientes de entrega, accesos rápidos. |
| **FUI** | Botón **Nuevo FUI** habilitado para admin, manager y supervisor; ruta `/tickets/new` como placeholder hasta Prompt #11. |
| **API (Hono)** | IAM con perfiles, middleware JWT, validaciones endurecidas en handlers. |
| **Offline** | Motor de cola y hooks alineados con TypeScript estricto; inicialización desde el layout del dashboard. |
| **Dev Windows** | Script PowerShell para liberar puertos 3000/3001 y limpiar `.next` antes de `next dev`. |
| **Documentación** | Historial técnico, changelog, política de seguridad, variables de entorno de ejemplo. |

Lo **no** incluido aún: panel admin de usuarios (Prompt #8), CRUD completo de tickets/equipment en UI, migración SQL única del seed Medplan en repo (recomendado como siguiente paso).

---

## Requisitos

- Node.js 20+ (recomendado LTS)
- npm (workspaces)
- Cuenta Supabase y variables según [`.env.example`](./.env.example)

---

## Arranque rápido

```bash
npm install
# Copiar .env.example → apps/web/.env.local y apps/api/.env (sin commitear)

# API
npm run dev:api

# Web (Windows: limpia conflictos de puerto y arranca)
npm run dev:web:reset
```

- Web: `http://localhost:3000` → login → dashboard.  
- API: `http://localhost:8787/health`

---

## Estructura del monorepo

```
apps/web      → Next.js 15 (App Router)
apps/api      → Hono + TypeScript
packages/types, utils, offline → código compartido
supabase/migrations → SQL versionado (hook JWT, offline; seed completo pendiente en archivo)
docs/         → historial de desarrollo y notas
scripts/      → utilidades de desarrollo (p. ej. reset Next en Windows)
```

---

## Documentación

| Archivo | Uso |
|---------|-----|
| [CHANGELOG.md](./CHANGELOG.md) | Versiones y cambios notables |
| [docs/HISTORIAL_DESARROLLO_FLUCORE.md](./docs/HISTORIAL_DESARROLLO_FLUCORE.md) | Errores resueltos, decisiones, checklist pre-push |
| [SECURITY.md](./SECURITY.md) | Buenas prácticas y reporte |
| [FLUCORE_AI_CONTEXT_v2.2.md](./FLUCORE_AI_CONTEXT_v2.2.md) | Contexto de arquitectura |
| [Flucore dev plan 2w.md](./Flucore%20dev%20plan%202w.md) | Plan de prompts por día |

---

## Licencia y uso

Repositorio privado / uso interno según política de tu organización.
