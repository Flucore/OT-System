# Seguridad — FluCore / OT-System

## Secretos y entorno

- **No** subas a GitHub: `apps/web/.env.local`, `apps/api/.env`, claves `service_role`, `DATABASE_URL` con contraseña real, ni tokens en issues o PRs.
- Usa **`.env.example`** como plantilla; cada desarrollador copia a archivos locales ignorados por git.
- La clave `SUPABASE_SERVICE_ROLE_KEY` en Next.js solo debe existir en el **servidor** (Server Components / Route Handlers). Nunca `NEXT_PUBLIC_*` ni código `'use client'`.

## Reporte de vulnerabilidades

Si encuentras un fallo de seguridad en este repositorio, repórtalo de forma privada al mantenedor del proyecto (no abras un issue público con detalles explotables hasta que haya mitigación acordada).

## Dependencias

- Revisa periódicamente `npm audit` en la raíz del monorepo y en cada workspace.
- Prioriza actualizaciones de `next`, `@supabase/*` y runtime Node por parches de seguridad.

## Supabase

- Mantén **RLS** habilitado en tablas expuestas; el JWT debe incluir `tenant_id` y `role` vía `custom_access_token_hook` (ver `docs/HISTORIAL_DESARROLLO_FLUCORE.md`).
- Rota claves en el panel de Supabase si sospechas filtración (anon, service_role, DB password).
