/**
 * FLUCORE — @flucore/offline
 * Paquete offline-first: IndexedDB + cola de sync + hooks React
 */

export { localDB, generateProvisionalTicketNumber, hydrateReferenceCache } from './db'
export { enqueue, getPendingItems, getFailedItems, retryFailed, cleanCompleted } from './sync-queue'
export { initSyncEngine, processQueue, onSyncStats } from './sync-engine'
export { useNetworkStatus } from './hooks/use-network-status'
export { useSyncStatus } from './hooks/use-sync-status'
export { useOfflineTicket, BusinessError } from './hooks/use-offline-ticket'

export type { SyncEngineOptions } from './sync-engine'
export type {
  LocalTicket, LocalEquipment, LocalFile, SyncQueueItem, SyncOperation,
  SyncStatus, SyncUIState, SyncStats, CachedProfile, CachedDeviceModel,
  CachedClient, CachedBranch, TicketStatus, UserRole,
} from './types'
