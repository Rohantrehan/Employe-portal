import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-mode badge away from the sidebar's user card.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
