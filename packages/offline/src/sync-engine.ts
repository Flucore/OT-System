/**
 * FLUCORE @flucore/offline — Motor de sincronización offline→online
 * Referencia: FLUCORE_OFFLINE_ARCH.md sección 9
 *
 * Responsabilidades:
 * 1. Detectar reconexión de red
 * 2. Procesar cola FIFO con backoff exponencial
 * 3. Aplicar respuestas del servidor al IndexedDB local
 * 4. Emitir eventos de estado para la UI
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

export function initSyncEngine(getAccessToken: () => Promise<string | null>): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => {
    if (_syncTimeout) clearTimeout(_syncTimeout)
    _syncTimeout = setTimeout(() => processQueue(getAccessToken), SYNC_DEBOUNCE_MS)
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

export async function processQueue(
  getAccessToken: () => Promise<string | null>
): Promise<void> {
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
      await processSingleItem(item, getAccessToken)
    }

    _lastSyncAt = new Date().toISOString()
  } finally {
    _isSyncing = false
    void emitStats()
  }
}

async function processSingleItem(
  item: SyncQueueItem,
  getAccessToken: () => Promise<string | null>
): Promise<void> {
  await markAsSyncing(item.id)
  void emitStats()

  const token = await getAccessToken()
  if (!token) {
    await markAsFailed(item.id, 'Sin token de autenticación. Re-login requerido.')
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
      const errorBody = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string } }
      await markAsFailed(item.id, `Error ${response.status}: ${errorBody?.error?.message ?? response.statusText}`)
    } else {
      await markAsPendingWithBackoff(item.id, `HTTP ${response.status}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de red desconocido'
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
