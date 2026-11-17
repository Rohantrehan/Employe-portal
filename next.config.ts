import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-mode badge away from the sidebar's user card.
  devIndicators: { position: "bottom-right" },
  // react-pdf loads fonts/images from disk at runtime; don't bundle it.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    // Re-visiting a page within 15s (back/forward, sidebar hops) is instant.
    // Any server action that saves data still refreshes it immediately.
    staleTimes: { dynamic: 15, static: 180 },
  },
  poweredByHeader: false,
};

export default nextConfig;
