/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
  // Note: For App Router, body size limits are set per-route
  // api.bodyParser is only for Pages Router
};

module.exports = nextConfig;
