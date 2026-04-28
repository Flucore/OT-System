const withSerwist = require('@serwist/next').default

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite importar paquetes internos del monorepo en Client Components
  transpilePackages: ['@flucore/offline', '@flucore/types', '@flucore/utils'],
  webpack: (config) => {
    // @react-pdf/renderer requiere esto en el entorno Node.js de Next.js
    config.resolve.alias.canvas = false
    return config
  },
}

module.exports = withSerwist({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // El SW se desactiva en dev — evita interferencia con HMR
  disable: process.env.NODE_ENV === 'development',
  // NUNCA interceptar auth ni API con el service worker
  exclude: [/\/api\//, /\/auth\/callback/],
  // Asegura que el nuevo SW tome control de inmediato tras actualización
  skipWaiting: true,
  clientsClaim: true,
})(nextConfig)
