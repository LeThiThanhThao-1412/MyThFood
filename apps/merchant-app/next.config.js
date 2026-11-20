/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@mythfood/api-client",
    "@mythfood/frontend-shared",
    "maplibre-gl",
  ],
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
