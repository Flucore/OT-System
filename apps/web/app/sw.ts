/**
 * FLUCORE — Service Worker (Serwist/Workbox)
 * Este archivo es el punto de entrada del SW. Next.js lo compila
 * separado del bundle principal mediante @serwist/next.
 *
 * Estrategias de caché:
 *   - Dashboard / tickets / equipment → NetworkFirst: muestra datos frescos
 *     cuando hay red, cae al caché si no hay conexión (máx 10s timeout)
 *   - Assets estáticos (JS, CSS, imágenes, fuentes) → CacheFirst: nunca
 *     cambian entre deploys (tienen hash en el nombre), 30 días de vida
 */

import { defaultCache } from '@serwist/next/worker'
import { NetworkFirst, CacheFirst, ExpirationPlugin } from 'serwist'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,   // disabled: interfiere con App Router + Supabase Auth
  runtimeCaching: [
    // Páginas operacionales — Network-First, fallback a caché tras 10s
    {
      matcher: /^\/(dashboard|tickets|equipment|admin|clients)/,
      handler: new NetworkFirst({
        cacheName: 'flucore-pages',
        plugins: [
          new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 }),
        ],
        networkTimeoutSeconds: 10,
      }),
    },
    // Assets estáticos con hash — CacheFirst, 30 días
    {
      matcher: /\.(js|css|png|jpg|jpeg|svg|ico|woff2?)(\?.*)?$/,
      handler: new CacheFirst({
        cacheName: 'flucore-static',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 150,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    // Resto — usa las estrategias por defecto de Serwist
    ...defaultCache,
  ],
})

serwist.addEventListeners()
