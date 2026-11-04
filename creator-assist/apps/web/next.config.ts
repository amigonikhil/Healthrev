import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Calculations, types and copy shared with the mobile app (TypeScript source).
  transpilePackages: ["@creator-assist/shared"],
  // STANDALONE=1 reproduces Vercel's traced-files-only bundle locally.
  ...(process.env.STANDALONE ? { output: "standalone" as const } : {}),
  // The git repository root (apps/web → creator-assist → repo), so files from
  // packages/shared and the workspace's node_modules are traced into the deployment.
  // It must be the git root, not creator-assist/: Vercel joins the app's path relative
  // to this folder onto its checkout root, and a shorter root makes it look for Next
  // in /vercel/path0/apps/web.
  outputFileTracingRoot: path.join(__dirname, "../../.."),
  // @react-pdf/renderer ships ESM + native-ish deps; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF fonts and images are read from disk at runtime, and pdfkit loads its standard
  // fonts through a package "imports" alias (#standard-fonts/*) that Vercel's
  // file tracer doesn't follow. Ship both explicitly for every route.
  outputFileTracingIncludes: {
    "/**/*": [
      "./src/fonts/**/*",
      "./src/assets/**/*",
      "../../node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // AIS JSON uploads
  },
};

export default nextConfig;
