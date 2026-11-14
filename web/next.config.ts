import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/anomaly", destination: "/seasons", permanent: true }];
  },
};

export default nextConfig;
