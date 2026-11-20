import type { NextConfig } from "next";
import { parseBackendOrigin } from "./lib/backend-origin.ts";

const backendOrigin = parseBackendOrigin(process.env.BEP_API_ORIGIN);
const config: NextConfig = {
  transpilePackages: ["@bep/contracts", "@bep/api-client"],
  async rewrites() {
    return backendOrigin
      ? [{ source: "/api/:path*", destination: `${backendOrigin}/api/:path*` }]
      : [];
  },
};
export default config;
