'use client'

import { useState, useEffect } from 'react'
import { useNetworkStatus } from '@flucore/offline'

// El hook lee navigator.onLine que no existe en SSR.
// Renderizamos un indicador neutro hasta que el componente está montado en el cliente.
export function NetworkStatusIndicator() {
  const [mounted, setMounted] = useState(false)
  const { isOnline } = useNetworkStatus()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-600" />
        <span className="text-xs text-slate-600">—</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full transition-colors ${
          isOnline ? 'bg-emerald-400' : 'bg-amber-400'
        }`}
      />
      <span className="text-xs text-slate-400">
        {isOnline ? 'En línea' : 'Sin conexión'}
      </span>
    </div>
  )
}
