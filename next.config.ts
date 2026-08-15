import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.DIALOGUELAB_NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@hyperframes/producer"],
  outputFileTracingExcludes: { "/*": ["./data/**/*"] },
  outputFileTracingIncludes: { "/*": ["./node_modules/gsap/dist/gsap.min.js"] },
};

export default nextConfig;
