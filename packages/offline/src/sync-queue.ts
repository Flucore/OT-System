/**
 * FLUCORE @flucore/offline — CRUD de la cola de sincronización
 * Referencia: FLUCORE_OFFLINE_ARCH.md sección 9
 */

import Dexie from 'dexie'
import { localDB } from './db'
import type { SyncOperation, SyncQueueItem, SyncQueueItemStatus } from './types'

interface EnqueueOptions {
  operation: SyncOperation
  entity_type: SyncQueueItem['entity_type']
  entity_id: string
  payload: unknown
  http_method: 'POST' | 'PATCH' | 'PUT'
  endpoint: string
}

export async function enqueue(options: EnqueueOptions): Promise<string> {
  const item: SyncQueueItem = {
    id: crypto.randomUUID(),
    ...options,
    created_at: new Date().toISOString(),
    retry_count: 0,
    last_retry_at: null,
    status: 'pending',
    error: null,
    _server_response: null,
  }
  await localDB.syncQueue.add(item)
  return item.id
}

export async function getPendingItems(): Promise<SyncQueueItem[]> {
  return localDB.syncQueue
    .where('[status+created_at]')
    .between(['pending', Dexie.minKey], ['pending', Dexie.maxKey])
    .sortBy('created_at')
}

export async function getFailedItems(): Promise<SyncQueueItem[]> {
  return localDB.syncQueue.where('status').equals('failed').toArray()
}

export async function getQueueCount(): Promise<{ pending: number; failed: number }> {
  const [pending, failed] = await Promise.all([
    localDB.syncQueue.where('status').equals('pending').count(),
    localDB.syncQueue.where('status').equals('failed').count(),
  ])
  return { pending, failed }
}

export async function markAsSyncing(id: string): Promise<void> {
  await localDB.syncQueue.update(id, { status: 'syncing' as SyncQueueItemStatus })
}

export async function markAsCompleted(id: string, serverResponse: unknown): Promise<void> {
  await localDB.syncQueue.update(id, {
    status: 'completed' as SyncQueueItemStatus,
    _server_response: serverResponse,
  })
}

export async function markAsPendingWithBackoff(id: string, error: string): Promise<void> {
  const item = await localDB.syncQueue.get(id)
  if (!item) return

  const newRetryCount = item.retry_count + 1
  const MAX_RETRIES = 5

  if (newRetryCount >= MAX_RETRIES) {
    await localDB.syncQueue.update(id, {
      status: 'failed' as SyncQueueItemStatus,
      retry_count: newRetryCount,
      last_retry_at: new Date().toISOString(),
      error: `Máximo de reintentos (${MAX_RETRIES}). Último error: ${error}`,
    })
    return
  }

  // Backoff exponencial: 1min, 2min, 4min, 8min, 16min
  await localDB.syncQueue.update(id, {
    status: 'pending' as SyncQueueItemStatus,
    retry_count: newRetryCount,
    last_retry_at: new Date().toISOString(),
    error: `[Intento ${newRetryCount}/${MAX_RETRIES}] ${error}`,
  })
}

export async function markAsFailed(id: string, error: string): Promise<void> {
  await localDB.syncQueue.update(id, {
    status: 'failed' as SyncQueueItemStatus,
    error,
    last_retry_at: new Date().toISOString(),
  })
}

export async function retryFailed(id: string): Promise<void> {
  await localDB.syncQueue.update(id, {
    status: 'pending' as SyncQueueItemStatus,
    retry_count: 0,
    error: null,
  })
}

export async function cleanCompleted(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const stale = await localDB.syncQueue
    .where('status').equals('completed')
    .and((item) => item.created_at < cutoff)
    .toArray()
  await localDB.syncQueue.bulkDelete(stale.map((i) => i.id))
  return stale.length
}
