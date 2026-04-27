'use client'
/**
 * FLUCORE @flucore/offline — Hook de estado de la cola de sync
 * Expone el estado de sync para el indicador en el header de la UI.
 */

import { useState, useEffect, useCallback } from 'react'
import { onSyncStats, processQueue } from '../sync-engine'
import { retryFailed, getFailedItems } from '../sync-queue'
import type { SyncStats } from '../types'

export function useSyncStatus(getAccessToken: () => Promise<string | null>) {
  const [stats, setStats] = useState<SyncStats>({
    pending: 0,
    failed: 0,
    state: 'online_synced',
    lastSyncAt: null,
  })

  useEffect(() => {
    return onSyncStats((newStats) => setStats(newStats))
  }, [])

  const retryAll = useCallback(async () => {
    const failed = await getFailedItems()
    await Promise.all(failed.map((item) => retryFailed(item.id)))
    await processQueue(getAccessToken)
  }, [getAccessToken])

  const syncNow = useCallback(async () => {
    await processQueue(getAccessToken)
  }, [getAccessToken])

  return { stats, retryAll, syncNow }
}
