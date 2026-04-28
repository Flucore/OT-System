/**
 * FLUCORE @flucore/offline — Motor de sincronización offline→online
 * Referencia: FLUCORE_OFFLINE_ARCH.md sección 9
 *
 * Responsabilidades:
 * 1. Detectar reconexión de red
 * 2. Procesar cola FIFO con backoff exponencial
 * 3. Aplicar respuestas del servidor al IndexedDB local
 * 4. Emitir eventos de estado para la UI
 *
 * Para fotos offline (UPLOAD_PHOTO):
 *   - Lee el Blob de localDB.localFiles
 *   - Delega el upload a `uploadBlob` (provisto por el app con Supabase Storage)
 *   - Luego registra el path en Hono vía POST /api/v1/tickets/:id/photos
 *   - El paquete no importa Supabase directamente — se mantiene desacoplado
 */

import { localDB, confirmTicketSync } from './db'
import {
  getPendingItems, markAsSyncing, markAsCompleted,
  markAsPendingWithBackoff, markAsFailed,
} from './sync-queue'
import type { SyncQueueItem, SyncStats, SyncUIState } from './types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
const SYNC_DEBOUNCE_MS = 2_000
const MIN_RETRY_INTERVAL_MS = 60_000

let _isSyncing = false
let _syncTimeout: ReturnType<typeof setTimeout> | null = null
let _listeners: Array<(stats: SyncStats) => void> = []
let _lastSyncAt: string | null = null

export interface SyncEngineOptions {
  getAccessToken: () => Promise<string | null>
  /**
   * Callback para subir archivos binarios a Supabase Storage (u otro proveedor).
   * El paquete @flucore/offline no importa @supabase/supabase-js — el app lo provee.
   * Recibe el storagePath (ya construido con buildStoragePath) y el Blob.
   * Debe lanzar un Error si falla; el motor lo tratará como reintentable.
   */
  uploadBlob?: (storagePath: string, blob: Blob) => Promise<void>
}

export function initSyncEngine(options: SyncEngineOptions): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => {
    if (_syncTimeout) clearTimeout(_syncTimeout)
    _syncTimeout = setTimeout(() => processQueue(options), SYNC_DEBOUNCE_MS)
  }

  const handleOffline = () => {
    if (_syncTimeout) clearTimeout(_syncTimeout)
    void emitStats()
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  if (navigator.onLine) handleOnline()

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    if (_syncTimeout) clearTimeout(_syncTimeout)
  }
}

export async function processQueue(options: SyncEngineOptions): Promise<void> {
  if (_isSyncing || !navigator.onLine) return

  _isSyncing = true
  void emitStats()

  try {
    const pending = await getPendingItems()
    if (pending.length === 0) {
      _lastSyncAt = new Date().toISOString()
      return
    }

    for (const item of pending) {
      if (item.last_retry_at && item.retry_count > 0) {
        const backoffMs = Math.pow(2, item.retry_count) * MIN_RETRY_INTERVAL_MS
        if (Date.now() < new Date(item.last_retry_at).getTime() + backoffMs) continue
      }
      await processSingleItem(item, options)
    }

    _lastSyncAt = new Date().toISOString()
  } finally {
    _isSyncing = false
    void emitStats()
  }
}

async function processSingleItem(
  item: SyncQueueItem,
  options: SyncEngineOptions,
): Promise<void> {
  await markAsSyncing(item.id)
  void emitStats()

  const token = await options.getAccessToken()
  if (!token) {
    await markAsFailed(item.id, 'Sin token de autenticación. Re-login requerido.')
    return
  }

  // UPLOAD_PHOTO requiere lógica especial: subir Blob antes de llamar a Hono
  if (item.operation === 'UPLOAD_PHOTO') {
    await processPhotoUpload(item, token, options.uploadBlob)
    return
  }

  const endpoint = item.endpoint.replace(':entity_id', item.entity_id)

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: item.http_method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Flucore-Offline-Sync': 'true',
      },
      body: JSON.stringify(item.payload),
    })

    if (response.ok) {
      const serverData = await response.json() as { data?: Record<string, unknown> }
      await markAsCompleted(item.id, serverData)
      await applyServerResponse(item, serverData)
    } else if (response.status >= 400 && response.status < 500) {
      // 4xx permanente — marcar como failed, no reintentar
      const errorBody = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string } }
      await markAsFailed(item.id, `Error ${response.status}: ${errorBody?.error?.message ?? response.statusText}`)
    } else {
      // 5xx transitorio — reintento con backoff
      await markAsPendingWithBackoff(item.id, `HTTP ${response.status}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de red desconocido'
    await markAsPendingWithBackoff(item.id, msg)
  }
}

/**
 * Sube un Blob offline a Supabase Storage y luego registra el path en Hono.
 * Si `uploadBlob` no se proveyó al inicializar el engine, falla la operación.
 */
async function processPhotoUpload(
  item: SyncQueueItem,
  token: string,
  uploadBlob: SyncEngineOptions['uploadBlob'],
): Promise<void> {
  if (!uploadBlob) {
    await markAsFailed(item.id, 'uploadBlob no configurado en initSyncEngine. Ver SyncEngineOptions.')
    return
  }

  const payload = item.payload as {
    localFileId: string
    storagePath: string
    ticketId: string
    tenantId: string
    phase: 'DIAGNOSTICO' | 'REPARACION'
  }

  const localFile = await localDB.localFiles.get(payload.localFileId)
  if (!localFile) {
    // El archivo fue eliminado antes de sincronizar — nada que hacer
    await markAsFailed(item.id, `Archivo local ${payload.localFileId} no encontrado en IndexedDB.`)
    return
  }

  try {
    // Paso 1: subir Blob a Supabase Storage (el app provee esta función)
    await uploadBlob(payload.storagePath, localFile.blob)

    // Paso 2: registrar el path en Hono para que se guarde en ticket_photos
    const response = await fetch(
      `${API_BASE_URL}/api/v1/tickets/${payload.ticketId}/photos`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Flucore-Offline-Sync': 'true',
        },
        body: JSON.stringify({
          storage_path: payload.storagePath,
          phase: payload.phase,
          tenant_id: payload.tenantId,
        }),
      }
    )

    if (response.ok) {
      const serverData = await response.json() as { data?: Record<string, unknown> }
      await markAsCompleted(item.id, serverData)
      // Limpiar el Blob local — ya está en Storage
      await localDB.localFiles.delete(payload.localFileId)
    } else if (response.status >= 400 && response.status < 500) {
      const errorBody = await response.json().catch(() => ({})) as { error?: { message?: string } }
      await markAsFailed(item.id, `Error ${response.status}: ${errorBody?.error?.message ?? response.statusText}`)
    } else {
      await markAsPendingWithBackoff(item.id, `HTTP ${response.status} al registrar foto`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido en upload de foto'
    await markAsPendingWithBackoff(item.id, msg)
  }
}

async function applyServerResponse(
  item: SyncQueueItem,
  serverData: { data?: Record<string, unknown> }
): Promise<void> {
  const data = serverData?.data
  if (!data) return

  if (item.operation === 'CREATE_TICKET') {
    await confirmTicketSync(item.entity_id, data as { id: string; ticket_number: string })
  } else if (item.operation === 'CHANGE_TICKET_STATUS') {
    await localDB.tickets.update(item.entity_id, {
      status: (data as { status: string }).status,
      sync_status: 'synced',
      _client_updated_at: new Date().toISOString(),
    })
  } else if (item.operation === 'UPDATE_DIAGNOSTIC') {
    await localDB.tickets.update(item.entity_id, {
      diagnostic_data: (data as { diagnostic_data: Record<string, unknown> }).diagnostic_data,
      sync_status: 'synced',
      updated_at: new Date().toISOString(),
    })
  } else if (item.operation === 'CREATE_EQUIPMENT') {
    await localDB.equipment.update(item.entity_id, {
      _provisional: false,
      sync_status: 'synced',
    })
  }
}

// --------------------------------------------------
// Eventos para la UI
// --------------------------------------------------

export function onSyncStats(listener: (stats: SyncStats) => void): () => void {
  _listeners.push(listener)
  return () => { _listeners = _listeners.filter((l) => l !== listener) }
}

async function emitStats(): Promise<void> {
  if (_listeners.length === 0) return
  const [pending, failed] = await Promise.all([
    localDB.syncQueue.where('status').equals('pending').count(),
    localDB.syncQueue.where('status').equals('failed').count(),
  ])
  const state = computeUIState(pending, failed)
  _listeners.forEach((l) => l({ pending, failed, state, lastSyncAt: _lastSyncAt }))
}

function computeUIState(pending: number, failed: number): SyncUIState {
  if (!navigator.onLine) return pending > 0 ? 'offline_pending' : 'offline_no_pending'
  if (_isSyncing) return 'online_syncing'
  if (failed > 0) return 'online_sync_error'
  if (pending > 0) return 'online_syncing'
  return 'online_synced'
}
