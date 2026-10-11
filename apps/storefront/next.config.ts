import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  transpilePackages: ["@oca/ui"],
  async rewrites() {
    return [
      // ຄຳຂໍຝັ່ງ browser (ກະຕ່າ, ສັ່ງຊື້, ສະລິບ) ຜ່ານເວັບເອງ: ບໍ່ຕ້ອງເປີດ CORS ທີ່ API
      { source: "/api/:path*", destination: `${apiUrl}/:path*` },
      // ຮູບສິນຄ້າທີ່ອັບໂຫຼດ (ProductImage.url = /media/files/<key>)
      { source: "/media/:path*", destination: `${apiUrl}/media/:path*` },
    ];
  },
};

export default nextConfig;
