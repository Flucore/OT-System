import withSerwistInit from '@serwist/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@flucore/offline', '@flucore/types', '@flucore/utils'],
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
}

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  exclude: [/\/api\//, /\/auth\/callback/],
})

export default withSerwist(nextConfig)
