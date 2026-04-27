-- ============================================================
-- FLUCORE MVP v2.1 — Esquema PostgreSQL 15+ (Supabase)
-- Migración: 001_core_schema.sql
-- Ejecutar en: Supabase SQL Editor o CLI
-- ============================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 2. ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'admin',
  'manager',
  'supervisor',
  'diag_tech',
  'repair_tech'
);

CREATE TYPE ticket_status AS ENUM (
  'INGRESADO',
  'EN_DIAGNOSTICO',
  'PENDIENTE_REVISION',
  'INFORME_APROBADO',
  'COTIZADO',
  'ESPERANDO_CLIENTE',
  'OT_GENERADA',
  'EN_REPARACION',
  'ESPERANDO_REPUESTO',
  'CONTROL_CALIDAD',
  'CERRADA',
  'CANCELADA'
);

CREATE TYPE inventory_source AS ENUM (
  'KAME_NEW',
  'DISASSEMBLY_RECYCLED'
);

CREATE TYPE ot_assignment_type AS ENUM (
  'SIN_OC',
  'CON_OC'
);

CREATE TYPE ticket_photo_phase AS ENUM (
  'DIAGNOSTICO',
  'REPARACION'
);

-- ============================================================
-- 3. IAM — IDENTIDAD Y PERMISOS
-- ============================================================

CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE tenants IS 'Empresas que contratan FluCore (ej: Medplan)';

-- Vinculada 1:1 con auth.users de Supabase
CREATE TABLE profiles (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email      VARCHAR(255) NOT NULL,
  full_name  VARCHAR(255) NOT NULL,
  role       user_role NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE profiles IS 'Personal del tenant. id = auth.users.id de Supabase';
COMMENT ON COLUMN profiles.role IS 'Determina permisos vía RLS y lógica de negocio';

-- ============================================================
-- 4. CLIENTES Y ACTIVOS
-- ============================================================

CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  rut           VARCHAR(20)  NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE clients IS 'Holding o empresa matriz (ej: Empresas RedSalud S.A.)';

CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  billing_rut VARCHAR(20),
  address     TEXT,
  city        VARCHAR(100),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE branches IS 'Sucursales físicas del cliente. billing_rut cuando factura diferente a la matriz';

CREATE TABLE device_models (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  brand      VARCHAR(100) NOT NULL,
  category   VARCHAR(100) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, brand, model_name)
);
COMMENT ON TABLE device_models IS 'Catálogo maestro. brand: Olympus/Fuji/Pentax. category: Panendoscopio/Colonoscopio/etc';

CREATE TABLE equipment (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  device_model_id UUID NOT NULL REFERENCES device_models(id) ON DELETE RESTRICT,
  serial_number   VARCHAR(100) NOT NULL,
  qr_code         VARCHAR(255) UNIQUE,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, serial_number)
);
COMMENT ON TABLE equipment IS 'Equipos médicos. qr_code genera el DNI digital del equipo';

-- ============================================================
-- 5. MOTOR TRANSACCIONAL (FUI + OT)
-- ============================================================

CREATE TABLE tickets (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_number  VARCHAR(20) UNIQUE NOT NULL,
  equipment_id   UUID NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  status         ticket_status DEFAULT 'INGRESADO',

  -- Trazabilidad de personas (del formulario PDF de 39 pasos)
  assigned_diag_tech_id   UUID REFERENCES profiles(id),
  assigned_repair_tech_id UUID REFERENCES profiles(id),
  supervisor_reviewer_id  UUID REFERENCES profiles(id),
  final_inspector_id      UUID REFERENCES profiles(id),

  -- Datos de recepción (header del formulario PDF)
  received_with_accessories BOOLEAN DEFAULT false,
  accessories_detail        TEXT,
  client_request_notes      TEXT,

  -- Los 39 puntos de diagnóstico de Medplan
  -- Ver FLUCORE_AI_CONTEXT.md sección 4.4 para la estructura exacta
  diagnostic_data JSONB DEFAULT '{}'::jsonb,

  -- Informe técnico generado por IA y aprobado por supervisor
  ai_report_draft    TEXT,
  ai_report_final    TEXT,
  report_approved_at TIMESTAMPTZ,
  report_approved_by UUID REFERENCES profiles(id),

  -- OT (Orden de Trabajo)
  ot_assignment_type    ot_assignment_type,
  ot_purchase_order_url TEXT,
  repair_comments       TEXT,

  -- Fechas clave del flujo
  received_at  TIMESTAMPTZ DEFAULT NOW(),
  diagnosed_at TIMESTAMPTZ,
  repaired_at  TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
COMMENT ON TABLE tickets IS 'Entidad central: FUI (INGRESADO→INFORME_APROBADO) y OT (OT_GENERADA→CERRADA)';
COMMENT ON COLUMN tickets.diagnostic_data IS 'JSONB con los 39 puntos. Flexible para otros tipos de equipos futuros';
COMMENT ON COLUMN tickets.ticket_number IS 'Generado automáticamente por trigger: MED-2025-0001';

-- Función y trigger para ticket_number automático
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  tenant_slug VARCHAR(10);
  year_str VARCHAR(4);
  seq_num INTEGER;
BEGIN
  SELECT UPPER(LEFT(slug, 3)) INTO tenant_slug FROM tenants WHERE id = NEW.tenant_id;
  year_str := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO seq_num 
  FROM tickets 
  WHERE tenant_id = NEW.tenant_id 
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.ticket_number := tenant_slug || '-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_number
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION generate_ticket_number();

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Integridad cross-tenant: el equipo debe pertenecer al mismo tenant del ticket
-- (un CHECK constraint no puede referenciar otras tablas en PostgreSQL — se usa trigger)
CREATE OR REPLACE FUNCTION validate_ticket_equipment_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM equipment
    WHERE id = NEW.equipment_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'equipment_id % no pertenece al tenant %', NEW.equipment_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_validate_ticket_equipment_tenant
  BEFORE INSERT OR UPDATE OF equipment_id, tenant_id ON tickets
  FOR EACH ROW EXECUTE FUNCTION validate_ticket_equipment_tenant();

-- Caja negra de auditoría. NUNCA hacer DELETE ni UPDATE en esta tabla.
CREATE TABLE ticket_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id),
  old_status ticket_status,
  new_status ticket_status NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE ticket_logs IS 'Auditoría inmutable. Registro de cada cambio de estado. Alimenta ML futuro.';

-- Imágenes adjuntas en diagnóstico o reparación
CREATE TABLE ticket_photos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES profiles(id),
  storage_path TEXT NOT NULL,
  caption      TEXT,
  phase        ticket_photo_phase NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON COLUMN ticket_photos.storage_path IS 'Path en Supabase Storage bucket: tickets/{ticket_id}/{filename}';

-- ============================================================
-- 6. COTIZACIONES
-- ============================================================

CREATE TABLE quotations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  created_by  UUID NOT NULL REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  subtotal    DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate    DECIMAL(5,4)  NOT NULL DEFAULT 0.19,
  total       DECIMAL(12,2) NOT NULL DEFAULT 0,
  pdf_url     TEXT,
  sent_at     TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON COLUMN quotations.tax_rate IS 'IVA chileno: 0.19 por defecto. Guardado en la cotización para inmutabilidad histórica';

-- ============================================================
-- 7. INVENTARIO
-- ============================================================

CREATE TABLE inventory_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  part_number VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  source      inventory_source NOT NULL,
  stock       INTEGER DEFAULT 0 CHECK (stock >= 0),
  cost_price  DECIMAL(10,2) DEFAULT 0.00,
  sell_price  DECIMAL(10,2) DEFAULT 0.00,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, part_number, source)
);
COMMENT ON COLUMN inventory_items.source IS 'KAME_NEW: repuesto nuevo del ERP. DISASSEMBLY_RECYCLED: canibalización de equipo viejo';

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE ticket_parts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  quotation_id  UUID REFERENCES quotations(id),
  part_id       UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  applied_price DECIMAL(10,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON COLUMN ticket_parts.applied_price IS 'Precio congelado al momento de cotizar. No cambia aunque el inventario cambie.';

-- ============================================================
-- 8. ÍNDICES DE RENDIMIENTO
-- ============================================================

-- Tickets: los más críticos del sistema
CREATE INDEX idx_tickets_tenant        ON tickets(tenant_id);
CREATE INDEX idx_tickets_status        ON tickets(status);
CREATE INDEX idx_tickets_tenant_status ON tickets(tenant_id, status);
CREATE INDEX idx_tickets_equipment     ON tickets(equipment_id);
-- GIN para búsquedas dentro del JSONB de diagnóstico (jsonb_path_ops: más eficiente para @> y @?)
CREATE INDEX idx_tickets_diag_gin      ON tickets USING GIN (diagnostic_data jsonb_path_ops);

-- Equipment
CREATE INDEX idx_equipment_tenant ON equipment(tenant_id);
CREATE INDEX idx_equipment_serial ON equipment(serial_number);

-- Profiles y tenant
CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_profiles_role   ON profiles(tenant_id, role);

-- Logs (para auditoría y timeline)
CREATE INDEX idx_ticket_logs_ticket ON ticket_logs(ticket_id);
CREATE INDEX idx_ticket_logs_tenant ON ticket_logs(tenant_id);
CREATE INDEX idx_ticket_logs_time   ON ticket_logs(ticket_id, created_at DESC);

-- Inventario
CREATE INDEX idx_inventory_tenant ON inventory_items(tenant_id);
CREATE INDEX idx_inventory_source ON inventory_items(tenant_id, source);

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Principio: FOR ALL es demasiado permisivo — usamos políticas granulares
-- por operación. El SERVICE_ROLE_KEY del backend bypasea RLS por diseño
-- de Supabase, por lo que WITH CHECK (false) solo bloquea al cliente.

-- Activar RLS en TODAS las tablas, incluyendo tenants
ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_models   ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_photos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_parts    ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- TENANTS: un usuario solo ve su propio tenant
-- Insert/update/delete bloqueados — solo service role puede mutar
-- -------------------------------------------------------
CREATE POLICY "tenants_select" ON tenants
  FOR SELECT USING (id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "tenants_no_insert" ON tenants
  FOR INSERT WITH CHECK (false);

CREATE POLICY "tenants_no_update" ON tenants
  FOR UPDATE USING (false);

CREATE POLICY "tenants_no_delete" ON tenants
  FOR DELETE USING (false);

-- -------------------------------------------------------
-- PROFILES: visibilidad controlada por rol + bloqueo de INSERT directo
-- Los perfiles se crean SOLO desde el backend Hono con SERVICE_ROLE_KEY
-- -------------------------------------------------------
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND (
      id = auth.uid()
      OR (auth.jwt() ->> 'role') IN ('admin', 'manager', 'supervisor')
    )
  );

CREATE POLICY "profiles_insert_block" ON profiles
  FOR INSERT WITH CHECK (false);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND (
      id = auth.uid()
      OR (auth.jwt() ->> 'role') IN ('admin', 'manager')
    )
  );

CREATE POLICY "profiles_no_delete" ON profiles
  FOR DELETE USING (false);

-- -------------------------------------------------------
-- TABLAS OPERACIONALES: aislamiento por tenant, granular
-- DELETE bloqueado en todas — soft delete via deleted_at / is_active
-- -------------------------------------------------------

-- clients
CREATE POLICY "clients_select" ON clients
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "clients_insert" ON clients
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "clients_update" ON clients
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "clients_no_delete" ON clients
  FOR DELETE USING (false);

-- branches
CREATE POLICY "branches_select" ON branches
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "branches_insert" ON branches
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "branches_update" ON branches
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "branches_no_delete" ON branches
  FOR DELETE USING (false);

-- device_models
CREATE POLICY "device_models_select" ON device_models
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "device_models_insert" ON device_models
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "device_models_update" ON device_models
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "device_models_no_delete" ON device_models
  FOR DELETE USING (false);

-- equipment
CREATE POLICY "equipment_select" ON equipment
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "equipment_insert" ON equipment
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "equipment_update" ON equipment
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "equipment_no_delete" ON equipment
  FOR DELETE USING (false);

-- tickets
CREATE POLICY "tickets_select" ON tickets
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tickets_insert" ON tickets
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tickets_update" ON tickets
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "tickets_no_delete" ON tickets
  FOR DELETE USING (false);

-- ticket_logs: caja negra inmutable desde el browser
-- Solo el backend (service role) puede insertar — protege la auditoría
CREATE POLICY "ticket_logs_select" ON ticket_logs
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "ticket_logs_no_insert" ON ticket_logs
  FOR INSERT WITH CHECK (false);
CREATE POLICY "ticket_logs_no_update" ON ticket_logs
  FOR UPDATE USING (false);
CREATE POLICY "ticket_logs_no_delete" ON ticket_logs
  FOR DELETE USING (false);

-- ticket_photos
CREATE POLICY "ticket_photos_select" ON ticket_photos
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "ticket_photos_insert" ON ticket_photos
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "ticket_photos_update" ON ticket_photos
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "ticket_photos_no_delete" ON ticket_photos
  FOR DELETE USING (false);

-- quotations
CREATE POLICY "quotations_select" ON quotations
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "quotations_insert" ON quotations
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "quotations_update" ON quotations
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "quotations_no_delete" ON quotations
  FOR DELETE USING (false);

-- inventory_items
CREATE POLICY "inventory_items_select" ON inventory_items
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "inventory_items_insert" ON inventory_items
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "inventory_items_update" ON inventory_items
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "inventory_items_no_delete" ON inventory_items
  FOR DELETE USING (false);

-- ticket_parts
CREATE POLICY "ticket_parts_select" ON ticket_parts
  FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "ticket_parts_insert" ON ticket_parts
  FOR INSERT WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "ticket_parts_update" ON ticket_parts
  FOR UPDATE USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY "ticket_parts_no_delete" ON ticket_parts
  FOR DELETE USING (false);

-- -------------------------------------------------------
-- STORAGE: aislamiento por tenant en bucket flucore-vault
-- El primer segmento del path DEBE ser el tenant_id del JWT
-- -------------------------------------------------------
CREATE POLICY "tenant_storage_isolation" ON storage.objects
  FOR ALL USING (
    bucket_id = 'flucore-vault'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

-- ============================================================
-- 10. DATOS SEMILLA (SEED) — Tenant Medplan
-- ============================================================

-- Insertar tenant inicial
INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Medplan', 'med');

-- Modelos de endoscopios más comunes de Medplan
INSERT INTO device_models (tenant_id, brand, category, model_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Olympus', 'Panendoscopio', 'GIF-H190'),
  ('00000000-0000-0000-0000-000000000001', 'Olympus', 'Panendoscopio', 'GIF-Q180'),
  ('00000000-0000-0000-0000-000000000001', 'Olympus', 'Colonoscopio',  'CF-H190L'),
  ('00000000-0000-0000-0000-000000000001', 'Olympus', 'Colonoscopio',  'CF-Q180AL'),
  ('00000000-0000-0000-0000-000000000001', 'Olympus', 'Duodenoscopio', 'TJF-Q180V'),
  ('00000000-0000-0000-0000-000000000001', 'Fuji',    'Panendoscopio', 'EG-600WR'),
  ('00000000-0000-0000-0000-000000000001', 'Fuji',    'Colonoscopio',  'EC-600WL'),
  ('00000000-0000-0000-0000-000000000001', 'Pentax',  'Panendoscopio', 'EG-2990i'),
  ('00000000-0000-0000-0000-000000000001', 'Pentax',  'Colonoscopio',  'EC-3890Li');
