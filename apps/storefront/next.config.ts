import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  transpilePackages: ["@oca/ui"],
  async rewrites() {
    return [
      // ຮູບສິນຄ້າທີ່ອັບໂຫຼດ (ProductImage.url = /media/files/<key>). ຄ່າ API_URL ຖືກຝັງຕອນ build.
      // ຄຳຂໍ /api/store/* ບໍ່ໃຊ້ rewrite (ເບິ່ງ src/app/api/store/[...path]/route.ts)
      { source: "/media/:path*", destination: `${apiUrl}/media/:path*` },
    ];
  },
};

export default nextConfig;
