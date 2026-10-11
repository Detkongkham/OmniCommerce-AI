import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { listCategories, listProducts } from "@/lib/store-api";

// ສ້າງຕອນມີຄຳຂໍ (build ບໍ່ຕ້ອງມີ API)
export const dynamic = "force-dynamic";

/** ເພດານໜ້າທີ່ດຶງ (24 ສິນຄ້າ/ໜ້າ = 4,800 ສິນຄ້າ); ເກີນນີ້ຕ້ອງແບ່ງ sitemap */
const MAX_PAGES = 200;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.8 },
  ];
  for (const category of await listCategories()) {
    entries.push({ url: `${base}/products?category=${category.slug}`, changeFrequency: "daily", priority: 0.6 });
  }
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await listProducts({ page });
    for (const product of result.items) {
      entries.push({ url: `${base}/products/${encodeURIComponent(product.slug)}`, changeFrequency: "weekly", priority: 0.7 });
    }
    if (page * result.pageSize >= result.total) break;
  }
  return entries;
}
