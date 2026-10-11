import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// STOREFRONT_URL ອ່ານຕອນມີຄຳຂໍ (ບໍ່ຝັງຄ່າຕອນ build)
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // ໜ້າບິນມີຂໍ້ມູນສ່ວນຕົວ (ເຂົ້າດ້ວຍລິ້ງລັບ); ກະຕ່າ/checkout ບໍ່ມີເນື້ອຫາໃຫ້ index
      disallow: ["/orders/", "/cart", "/checkout", "/api/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
