/** @type {import('next').NextConfig} */
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig = {
  reactStrictMode: true,
  // GitHub Pages serves the repo under /<repo>, so the export needs a base path.
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // `STATIC_EXPORT=1` produces `out/` for Pages; the default build stays a normal server app.
  ...(process.env.STATIC_EXPORT
    ? { output: "export", trailingSlash: true, images: { unoptimized: true } }
    : {}),
  // The IDL is read from the Anchor build output at runtime on the server only.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },
};

export default nextConfig;
