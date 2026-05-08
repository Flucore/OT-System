'use client'

import { useState, useEffect } from 'react'
import { useNetworkStatus } from '@flucore/offline'

export function NetworkStatusWidget() {
  const [mounted, setMounted] = useState(false)
  const { isOnline } = useNetworkStatus()

  useEffect(() => {
    setMounted(true)
  }, [])

  // No renderizar nada hasta mount (evita hydration mismatch)
  if (!mounted || isOnline) return null

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-800 bg-amber-950/40 px-5 py-4">
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-400" />
      <div>
        <p className="text-sm font-medium text-amber-300">Sistema operando sin conexión</p>
        <p className="text-xs text-amber-600">
          Los cambios se guardan localmente y se sincronizarán al recuperar la red.
        </p>
      </div>
    </div>
  )
}
