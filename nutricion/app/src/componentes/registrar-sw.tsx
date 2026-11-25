'use client'

import { useEffect } from 'react'

/** Registra el service worker (necesario para instalar la app). Solo en producción. */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])
  return null
}
