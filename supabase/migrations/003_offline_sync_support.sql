-- ============================================================
-- Migración: 003_offline_sync_support.sql
-- Fecha: 2026-04-26
-- Descripción: Adaptaciones para soporte offline-first.
--   1. Trigger generate_ticket_number respeta provisionales 'OFFLINE-'
--   2. Columna _client_updated_at para resolución de conflictos
--   3. Columna sync_origin para trazabilidad
-- Referencia: FLUCORE_OFFLINE_ARCH.md secciones 6 y 8
-- Ejecutar: Después de 001 y 002
-- ============================================================

-- ============================================================
-- 1. MODIFICAR TRIGGER — respetar ticket_numbers provisionales
-- ============================================================

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  tenant_slug VARCHAR(10);
  year_str    VARCHAR(4);
  seq_num     INTEGER;
BEGIN
  -- Si ya viene con un número definitivo (no provisional), conservarlo
  IF NEW.ticket_number IS NOT NULL
     AND NEW.ticket_number != ''
     AND NEW.ticket_number NOT LIKE 'OFFLINE-%'
  THEN
    RETURN NEW;
  END IF;

  SELECT UPPER(LEFT(slug, 3)) INTO tenant_slug FROM tenants WHERE id = NEW.tenant_id;
  year_str := EXTRACT(YEAR FROM NOW())::TEXT;

  SELECT COUNT(*) + 1 INTO seq_num
  FROM tickets
  WHERE tenant_id = NEW.tenant_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
    AND ticket_number NOT LIKE 'OFFLINE-%';

  NEW.ticket_number := tenant_slug || '-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. _client_updated_at — resolución de conflictos Last-Write-Wins
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS _client_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN tickets._client_updated_at IS
  'Timestamp del cliente al hacer el cambio offline. Para resolución de conflictos.';

-- ============================================================
-- 3. sync_origin — trazabilidad de sincronizaciones
-- ============================================================

DO $$ BEGIN
  CREATE TYPE sync_origin AS ENUM ('online', 'offline_sync');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS sync_origin sync_origin DEFAULT 'online';

COMMENT ON COLUMN tickets.sync_origin IS
  'online = creado en línea. offline_sync = sincronizado desde cliente offline.';

-- ============================================================
-- 4. Índice para detectar tickets provisionales
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tickets_provisional
  ON tickets(tenant_id)
  WHERE ticket_number LIKE 'OFFLINE-%';

-- ============================================================
-- Verificación (ejecutar manualmente):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'tickets'
--   AND column_name IN ('_client_updated_at', 'sync_origin');
-- ============================================================
