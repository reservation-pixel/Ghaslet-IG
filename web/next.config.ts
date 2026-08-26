import { config as loadEnv } from "dotenv";
import path from "node:path";
import type { NextConfig } from "next";

loadEnv({ path: path.resolve(process.cwd(), "../.env.all") });

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "**.fbcdn.net",
      },
    ],
  },
};

export default nextConfig;
