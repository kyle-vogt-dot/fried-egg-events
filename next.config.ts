/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Allow your phone to access the dev server
  experimental: {
    allowedDevOrigins: ['10.0.0.22'],
  },
};

export default nextConfig;