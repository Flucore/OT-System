/**
 * FLUCORE @flucore/offline — Schema de IndexedDB con Dexie
 * Referencia: FLUCORE_OFFLINE_ARCH.md sección 5
 */

import Dexie, { type EntityTable } from 'dexie'
import type {
  LocalTicket, LocalEquipment, SyncQueueItem,
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
  }
}

export const localDB = new FluCoreLocalDB()

// --------------------------------------------------
// Helpers
// --------------------------------------------------

export async function generateProvisionalTicketNumber(): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const todayCount = await localDB.tickets
    .where('created_at')
    .aboveOrEqual(todayStart.toISOString())
    .count()

  const seq = String(todayCount + 1).padStart(3, '0')
  return `OFFLINE-${dateStr}-${seq}`
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
