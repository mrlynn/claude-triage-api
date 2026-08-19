import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/**
 * turbopack.root is pinned because this app lives inside a repo that has its
 * own lockfile at the root. Without it, Next infers the parent as the
 * workspace root and warns on every build.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
