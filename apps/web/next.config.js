const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // No precachear rutas dinámicas de auth ni API proxy
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      // Páginas del dashboard: Network-First con fallback a cache
      urlPattern: /^https:\/\/.*\/(dashboard|tickets|equipment|admin)/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'flucore-pages',
        networkTimeoutSeconds: 10,
      },
    },
    {
      // Assets estáticos: CacheFirst
      urlPattern: /\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'flucore-static',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
  ],
  // NUNCA interceptar estas rutas con el SW
  exclude: [/\/api\//, /\/auth\/callback/],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite importar @react-pdf/renderer en Client Components
  transpilePackages: ['@flucore/offline', '@flucore/types', '@flucore/utils'],
  webpack: (config) => {
    // next-pwa y @react-pdf/renderer necesitan esto
    config.resolve.alias.canvas = false
    return config
  },
}

module.exports = withPWA(nextConfig)
