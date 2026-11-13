import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-mode badge away from the sidebar's user card.
  devIndicators: { position: "bottom-right" },
  // react-pdf loads fonts/images from disk at runtime; don't bundle it.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
