import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["torrent-search-api"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
      },
      {
        protocol: "https",
        hostname: "imdb.iamidiotareyoutoo.com",
      },
    ],
  },
};

export default nextConfig;
