import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This app lives in a subfolder of a repo that has its own lockfile.
  outputFileTracingRoot: path.join(__dirname),
  // @react-pdf/renderer ships ESM + native-ish deps; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF fonts are read from disk at runtime; make sure Vercel ships them.
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/fonts/**/*"],
    "/s/**/*": ["./src/fonts/**/*"],
    "/deals/**/*": ["./src/fonts/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // AIS JSON uploads
  },
};

export default nextConfig;
