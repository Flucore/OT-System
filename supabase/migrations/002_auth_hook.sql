-- ============================================================
-- Migración: 002_auth_hook.sql
-- Fecha: 2026-04-27
-- Descripción: JWT custom hook + trigger helper + storage RLS
--   1. custom_access_token_hook — inyecta tenant_id y role en el JWT
--   2. update_updated_at()      — trigger genérico para updated_at
--   3. tenant_storage_isolation — RLS de storage para flucore-vault
-- Referencia: FLUCORE_AI_CONTEXT_v2.2.md secciones 5 y 9
-- Ejecutar: DESPUÉS de 001_core_schema_1.sql, ANTES de 003_offline_sync_support.sql
-- ============================================================

-- ============================================================
-- SECCIÓN 1 — custom_access_token_hook
--
-- ¿Por qué existe esta función?
-- Supabase genera JWTs estándar con sub, email, role (internal).
-- El sistema de multi-tenant de FluCore necesita que CADA JWT cargue
-- también tenant_id y el rol de negocio (admin, supervisor, diag_tech…).
-- Sin este hook: auth.jwt() ->> 'tenant_id' devuelve NULL y todas las
-- políticas RLS fallan silenciosamente — los usuarios no verían datos.
--
-- Flujo: Usuario hace login → Supabase llama a este hook ANTES de
--        firmar el JWT → hook lee profiles → inyecta claims → JWT firmado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- STABLE: no modifica datos, solo lee. Permite caches internas de Postgres.
STABLE
SET search_path = public
AS $$
DECLARE
  user_tenant_id  UUID;
  user_role_value TEXT;
BEGIN
  -- Leer tenant_id y role desde profiles usando el user_id del evento
  -- event ->> 'user_id' es el UUID del usuario en auth.users
  SELECT
    p.tenant_id,
    p.role::TEXT          -- cast desde ENUM user_role → TEXT para el JWT
  INTO
    user_tenant_id,
    user_role_value
  FROM public.profiles p
  WHERE p.id = (event ->> 'user_id')::UUID;

  -- Guardia: si el perfil no existe aún (ej: primer login antes del seed),
  -- devolver el evento sin modificar. NO crashear — el usuario podrá
  -- autenticarse pero sin claims; el middleware Hono le dará 403.
  IF user_tenant_id IS NULL THEN
    RETURN event;
  END IF;

  -- Inyectar claims en el JWT
  -- jsonb_set(target, path, value) crea la clave si no existe
  event := jsonb_set(event, '{claims, tenant_id}', to_jsonb(user_tenant_id::TEXT), true);
  event := jsonb_set(event, '{claims, role}',      to_jsonb(user_role_value),       true);

  RETURN event;
END;
$$;

-- Permisos: solo supabase_auth_admin puede invocar el hook
-- (es el rol interno que usa el sistema de auth de Supabase)
GRANT EXECUTE
  ON FUNCTION public.custom_access_token_hook(JSONB)
  TO supabase_auth_admin;

REVOKE EXECUTE
  ON FUNCTION public.custom_access_token_hook(JSONB)
  FROM authenticated, anon, public;

-- ============================================================
-- SECCIÓN 2 — Trigger genérico update_updated_at()
--
-- Propósito: mantener la columna updated_at sincronizada
-- automáticamente en cada UPDATE, sin depender de la app.
-- Uso: CREATE TRIGGER trg_{tabla}_updated_at
--        BEFORE UPDATE ON {tabla}
--        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- NOTA: incluido aquí en caso de que 001 no lo haya creado.
--       OR REPLACE lo hace idempotente (seguro ejecutar dos veces).
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- SECCIÓN 3 — RLS de Supabase Storage (bucket flucore-vault)
--
-- ¿Por qué FOR ALL aquí y no en tablas normales?
-- storage.objects es manejado internamente por Supabase — no
-- acepta el patrón separado SELECT/INSERT/UPDATE. FOR ALL con
-- una sola USING cubre lectura y escritura en este contexto.
--
-- Regla: el primer segmento del path DEBE ser el tenant_id del JWT.
-- Ej: {tenant_id}/tickets/{ticket_id}/photos/... ✅
--     otro-tenant/tickets/...                    ❌ bloqueado
--
-- NOTA: Si ya existe esta política en 001, esta instrucción fallará
--       con "policy already exists". Es seguro ignorar ese error.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'tenant_storage_isolation'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "tenant_storage_isolation" ON storage.objects
        FOR ALL USING (
          bucket_id = 'flucore-vault'
          AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
        )
    $policy$;
  END IF;
END;
$$;

-- ============================================================
-- POST-EJECUCIÓN MANUAL OBLIGATORIA (hacer en Supabase Dashboard)
-- ============================================================
--
-- PASO A — Activar el hook en el Dashboard:
--   Authentication → Hooks → "Custom Access Token"
--   → Function: public.custom_access_token_hook
--   → Guardar. SIN este paso el hook no se invoca nunca.
--
-- PASO B — Verificar que el hook funciona:
--   1. Crear un usuario test en Authentication → Users
--   2. Asignar un perfil en la tabla profiles con tenant_id y role
--   3. Hacer login desde el cliente y copiar el JWT del localStorage
--   4. Pegar en https://jwt.io y verificar que aparecen:
--        "tenant_id": "uuid-del-tenant"
--        "role": "supervisor" (o el rol asignado)
--   5. Si NO aparecen: revisar que el perfil existe y que el hook
--      está activado en el Dashboard.
--
-- PASO C — Verificar RLS storage:
--   Storage → flucore-vault → Settings → Policies
--   Debe aparecer "tenant_storage_isolation" con FOR ALL.
--
-- ⚠️  SIN el hook activo, auth.jwt() ->> 'tenant_id' = NULL
--     y TODOS los SELECT con RLS devuelven 0 filas (sin error visible).
-- ============================================================
