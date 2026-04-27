// Bucket único de Supabase Storage para FluCore
export const FLUCORE_BUCKET = 'flucore-vault'

type StorageModule = 'tickets' | 'quotations'
type StorageType = 'photos' | 'reports' | 'purchase_orders' | 'document'

/**
 * Construye la ruta canónica de un archivo en Supabase Storage.
 * Patrón: {tenant_id}/{modulo}/{entidad_id}/{tipo}/{timestamp}_{filename}
 *
 * REGLA: SIEMPRE usar esta función para construir paths de upload.
 * Nunca hardcodear paths — el primer segmento DEBE ser el tenant_id
 * para que la policy RLS "tenant_storage_isolation" funcione.
 */
export function buildStoragePath(
  tenantId: string,
  module: StorageModule,
  entityId: string,
  type: StorageType,
  filename: string
): string {
  const timestamp = Date.now()
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${tenantId}/${module}/${entityId}/${type}/${timestamp}_${sanitized}`
}

/**
 * Extrae el tenant_id del primer segmento de un path de Storage.
 * Usado para validación y logging.
 */
export function getTenantIdFromPath(storagePath: string): string | null {
  const parts = storagePath.split('/')
  return parts[0] ?? null
}
