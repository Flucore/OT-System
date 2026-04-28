/**
 * FLUCORE @flucore/offline — Schema de IndexedDB con Dexie
 * Referencia: FLUCORE_OFFLINE_ARCH.md sección 5
 *
 * Versiones del schema:
 *   v1 — tablas base: tickets, equipment, syncQueue, caches de referencia
 *   v2 — localFiles: almacén de Blobs para fotos tomadas offline
 */

import Dexie, { type EntityTable } from 'dexie'
import type {
  LocalTicket, LocalEquipment, LocalFile, SyncQueueItem,
  CachedProfile, CachedDeviceModel, CachedClient, CachedBranch,
} from './types'

class FluCoreLocalDB extends Dexie {
  tickets!: EntityTable<LocalTicket, 'id'>
  equipment!: EntityTable<LocalEquipment, 'id'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>
  profiles!: EntityTable<CachedProfile, 'id'>
  deviceModels!: EntityTable<CachedDeviceModel, 'id'>
  clients!: EntityTable<CachedClient, 'id'>
  branches!: EntityTable<CachedBranch, 'id'>
  localFiles!: EntityTable<LocalFile, 'id'>

  constructor() {
    super('flucore_local_db')

    this.version(1).stores({
      tickets: [
        'id', 'tenant_id', 'status', '[tenant_id+status]',
        'assigned_diag_tech_id', 'assigned_repair_tech_id',
        'sync_status', '_provisional', 'created_at', 'updated_at',
      ].join(', '),

      equipment: [
        'id', 'serial_number', 'tenant_id',
        '[tenant_id+serial_number]', 'branch_id', 'sync_status',
      ].join(', '),

      syncQueue: [
        'id', 'status', 'entity_type', 'entity_id',
        'operation', 'created_at', '[status+created_at]',
      ].join(', '),

      profiles: 'id, tenant_id, role',
      deviceModels: 'id, tenant_id, brand',
      clients: 'id, tenant_id',
      branches: 'id, tenant_id, client_id',
    })

    // v2: localFiles guarda Blobs de fotos tomadas offline.
    // Dexie 4 maneja Blobs nativamente en IndexedDB — no serializar a base64.
    this.version(2).stores({
      localFiles: 'id, storagePath, created_at',
    })
  }
}

export const localDB = new FluCoreLocalDB()

// --------------------------------------------------
// Helpers
// --------------------------------------------------

/**
 * Genera un número provisional con un fragmento UUID para evitar colisiones
 * aunque el técnico borre el IndexedDB o trabaje desde varios dispositivos.
 * Formato: OFFLINE-YYYYMMDD-XXXX (XXXX = 4 chars hex aleatorios)
 *
 * ❌ Antes usaba count()+1 → colisión si se borraba IndexedDB
 * ✅ Ahora usa crypto.randomUUID() → probabilidad de colisión ~1 en 1M
 */
export async function generateProvisionalTicketNumber(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = crypto.randomUUID().slice(0, 4).toUpperCase()
  return `OFFLINE-${dateStr}-${suffix}`
}

export async function confirmTicketSync(
  localId: string,
  serverResponse: { id: string; ticket_number: string; [key: string]: unknown }
): Promise<void> {
  await localDB.tickets.update(localId, {
    ticket_number: serverResponse.ticket_number,
    _provisional: false,
    sync_status: 'synced',
    _client_updated_at: new Date().toISOString(),
  })
}

export async function hydrateReferenceCache(data: {
  profiles?: CachedProfile[]
  deviceModels?: CachedDeviceModel[]
  clients?: CachedClient[]
  branches?: CachedBranch[]
}): Promise<void> {
  await localDB.transaction(
    'rw',
    [localDB.profiles, localDB.deviceModels, localDB.clients, localDB.branches],
    async () => {
      if (data.profiles?.length) await localDB.profiles.bulkPut(data.profiles)
      if (data.deviceModels?.length) await localDB.deviceModels.bulkPut(data.deviceModels)
      if (data.clients?.length) await localDB.clients.bulkPut(data.clients)
      if (data.branches?.length) await localDB.branches.bulkPut(data.branches)
    }
  )
}
