import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // admin/ has its own lockfile inside the app repo; keep Next from treating the repo root as the workspace.
  outputFileTracingRoot: __dirname,
  // A plain static site: `npm run build` writes out/, which any static host can serve.
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
