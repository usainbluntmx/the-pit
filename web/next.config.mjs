/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The IDL is read from the Anchor build output at runtime on the server only.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },
};

export default nextConfig;
