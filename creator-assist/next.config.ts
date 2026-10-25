import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // STANDALONE=1 reproduces Vercel's traced-files-only bundle locally.
  ...(process.env.STANDALONE ? { output: "standalone" as const } : {}),
  // This app lives in a subfolder of a repo that has its own lockfile.
  outputFileTracingRoot: path.join(__dirname),
  // @react-pdf/renderer ships ESM + native-ish deps; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF fonts and images are read from disk at runtime, and pdfkit loads its standard
  // fonts through a package "imports" alias (#standard-fonts/*) that Vercel's
  // file tracer doesn't follow. Ship both explicitly for every route.
  outputFileTracingIncludes: {
    "/**/*": [
      "./src/fonts/**/*",
      "./src/assets/**/*",
      "./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // AIS JSON uploads
  },
};

export default nextConfig;
