/**
 * FLUCORE @flucore/offline — Tipos del sistema offline-first
 * Referencia: FLUCORE_OFFLINE_ARCH.md sección 5
 */

export type TicketStatus =
  | 'INGRESADO' | 'EN_DIAGNOSTICO' | 'PENDIENTE_REVISION' | 'INFORME_APROBADO'
  | 'COTIZADO' | 'ESPERANDO_CLIENTE' | 'OT_GENERADA' | 'EN_REPARACION'
  | 'ESPERANDO_REPUESTO' | 'CONTROL_CALIDAD' | 'CERRADA' | 'CANCELADA'

export type UserRole = 'admin' | 'manager' | 'supervisor' | 'diag_tech' | 'repair_tech'

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'failed'

export type SyncOperation =
  | 'CREATE_TICKET'
  | 'UPDATE_DIAGNOSTIC'
  | 'CHANGE_TICKET_STATUS'
  | 'CREATE_EQUIPMENT'
  | 'UPDATE_OT_PROGRESS'
  | 'UPLOAD_PHOTO'        // sube Blob a Storage + registra metadata en Hono

export type SyncQueueItemStatus = 'pending' | 'syncing' | 'failed' | 'completed'

// --------------------------------------------------
// Entidades locales (espejo de tablas Supabase)
// --------------------------------------------------

export interface LocalTicket {
  id: string
  ticket_number: string          // 'OFFLINE-YYYYMMDD-XXX' hasta sincronizar
  equipment_id: string
  tenant_id: string
  status: TicketStatus
  assigned_diag_tech_id: string | null
  assigned_repair_tech_id: string | null
  received_with_accessories: boolean
  accessories_detail: string | null
  client_request_notes: string | null
  diagnostic_data: Record<string, unknown>
  ai_report_draft: string | null
  ai_report_final: string | null
  repair_comments: string | null
  received_at: string
  diagnosed_at: string | null
  repaired_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  sync_status: SyncStatus
  _provisional: boolean          // true = aún no confirmado por el servidor
  _client_updated_at: string     // Para resolución de conflictos Last-Write-Wins
}

export interface LocalEquipment {
  id: string
  serial_number: string
  device_model_id: string
  branch_id: string
  tenant_id: string
  qr_code: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  sync_status: SyncStatus
  _provisional: boolean
}

// --------------------------------------------------
// Caché de datos de referencia (solo lectura local)
// --------------------------------------------------

export interface CachedProfile {
  id: string
  full_name: string
  email: string
  role: UserRole
  tenant_id: string
  is_active: boolean
}

export interface CachedDeviceModel {
  id: string
  brand: string
  category: string
  model_name: string
  tenant_id: string
}

export interface CachedClient {
  id: string
  business_name: string
  rut: string
  tenant_id: string
  is_active: boolean
}

export interface CachedBranch {
  id: string
  name: string
  client_id: string
  billing_rut: string | null
  address: string | null
  city: string | null
  tenant_id: string
}

// --------------------------------------------------
// Cola de sincronización
// --------------------------------------------------

// Archivo binario guardado localmente hasta poder subir a Supabase Storage
export interface LocalFile {
  id: string           // UUID = también es el entity_id en la cola de sync
  storagePath: string  // path final en flucore-vault ({tenant_id}/tickets/...)
  blob: Blob           // Dexie v4 almacena Blobs nativamente en IndexedDB
  mimeType: string
  created_at: string
}

export interface SyncQueueItem {
  id: string                     // UUID local de la operación
  operation: SyncOperation
  entity_type: 'ticket' | 'equipment' | 'ot_progress' | 'photo'
  entity_id: string
  payload: unknown
  http_method: 'POST' | 'PATCH' | 'PUT'
  endpoint: string               // '/api/v1/tickets' o '/api/v1/tickets/:entity_id/...'
  created_at: string
  retry_count: number
  last_retry_at: string | null
  status: SyncQueueItemStatus
  error: string | null
  _server_response: unknown
}

// --------------------------------------------------
// Estado de sync para la UI
// --------------------------------------------------

export type SyncUIState =
  | 'online_synced'
  | 'online_syncing'
  | 'online_sync_error'
  | 'offline_pending'
  | 'offline_no_pending'

export interface SyncStats {
  pending: number
  failed: number
  state: SyncUIState
  lastSyncAt: string | null
}
