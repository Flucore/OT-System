'use client'
/**
 * FLUCORE @flucore/offline — Hook de estado de red
 * Compatible con Chrome, Firefox, Safari (incluido iOS).
 */

import { useState, useEffect, useCallback } from 'react'

export interface NetworkStatus {
  isOnline: boolean
  isOffline: boolean
  offlineSince: Date | null
  justReconnected: boolean
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [offlineSince, setOfflineSince] = useState<Date | null>(null)
  const [justReconnected, setJustReconnected] = useState(false)

  const handleOnline = useCallback(() => {
    const wasOffline = !isOnline
    setIsOnline(true)
    setOfflineSince(null)
    if (wasOffline) {
      setJustReconnected(true)
      setTimeout(() => setJustReconnected(false), 3_000)
    }
  }, [isOnline])

  const handleOffline = useCallback(() => {
    setIsOnline(false)
    setOfflineSince(new Date())
    setJustReconnected(false)
  }, [])

  useEffect(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  return { isOnline, isOffline: !isOnline, offlineSince, justReconnected }
}
