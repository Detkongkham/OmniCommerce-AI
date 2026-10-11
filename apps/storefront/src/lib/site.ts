/** URL ສາທາລະນະຂອງເວັບ (ໃຊ້ໃນ metadata, sitemap, robots). ຕັ້ງ STOREFRONT_URL ຕອນ deploy */
export function siteUrl(): string {
  return (process.env.STOREFRONT_URL || "http://localhost:3002").replace(/\/+$/, "");
}
