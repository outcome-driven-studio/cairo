/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CAIRO_WRITE_KEY: process.env.NEXT_PUBLIC_CAIRO_WRITE_KEY || 'demo-write-key',
    NEXT_PUBLIC_CAIRO_URL: process.env.NEXT_PUBLIC_CAIRO_URL || 'http://localhost:8080',
  },
};

module.exports = nextConfig;