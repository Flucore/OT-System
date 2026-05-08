'use client'

import { useSyncStatus } from '@flucore/offline'

interface SyncStatusBadgeProps {
  getAccessToken: () => Promise<string | null>
}

export function SyncStatusBadge({ getAccessToken }: SyncStatusBadgeProps) {
  const { stats, retryAll } = useSyncStatus(getAccessToken)
  const { pending, failed, state } = stats

  if (state === 'online_syncing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-950 px-2.5 py-1 text-xs text-sky-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
        Sincronizando…
      </span>
    )
  }

  if (failed > 0) {
    return (
      <button
        onClick={retryAll}
        className="inline-flex items-center gap-1.5 rounded-full bg-red-950 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-900"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        {failed} fallida{failed !== 1 ? 's' : ''} · Reintentar
      </button>
    )
  }

  if (pending > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950 px-2.5 py-1 text-xs text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        {pending} pendiente{pending !== 1 ? 's' : ''}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Sincronizado
    </span>
  )
}
