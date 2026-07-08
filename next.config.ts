import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are enabled by default in Next 15; keep body limit generous
    // for later phases that upload HDFC allocation .xlsx files.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
