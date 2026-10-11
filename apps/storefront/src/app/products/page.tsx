import { EmptyState, buttonVariants } from "@oca/ui";
import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryNav } from "@/components/category-nav";
import { PaginationNav } from "@/components/pagination-nav";
import { ProductGrid } from "@/components/product-grid";
import { type RawSearchParams, parseProductsParams } from "@/lib/search-params";
import { listCategories, listProducts } from "@/lib/store-api";

interface ProductsPageProps {
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ searchParams }: ProductsPageProps): Promise<Metadata> {
  const query = parseProductsParams(await searchParams);
  if (query.q) {
    // ໜ້າຜົນຄົ້ນຫາບໍ່ຄວນຖືກ index (ເນື້ອຫາຊ້ຳກັບໜ້າລາຍການ)
    return { title: `ຄົ້ນຫາ "${query.q}"`, robots: { index: false, follow: true } };
  }
  if (query.category) {
    const category = (await listCategories()).find((item) => item.slug === query.category);
    return { title: category?.name ?? "ສິນຄ້າ" };
  }
  return { title: "ສິນຄ້າທັງໝົດ" };
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const query = parseProductsParams(await searchParams);
  const [products, categories] = await Promise.all([listProducts(query), listCategories()]);
  const category = categories.find((item) => item.slug === query.category);
  const heading = query.q ? `ຜົນຄົ້ນຫາ "${query.q}"` : (category?.name ?? "ສິນຄ້າທັງໝົດ");

  return (
    <div className="flex flex-col gap-5">
      <CategoryNav categories={categories} active={query.category} q={query.q} />
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{heading}</h1>
        <p className="shrink-0 text-sm text-ink-secondary">{products.total} ລາຍການ</p>
      </div>
      {products.items.length > 0 ? (
        <ProductGrid products={products.items} />
      ) : (
        <EmptyState
          icon={SearchX}
          title="ບໍ່ພົບສິນຄ້າ"
          description={query.q ? "ລອງຄົ້ນຫາດ້ວຍຄຳອື່ນ ຫຼື ເບິ່ງສິນຄ້າທັງໝົດ" : "ຍັງບໍ່ມີສິນຄ້າໃນໝວດໝູ່ນີ້"}
          action={
            <Link href="/products" className={buttonVariants({ variant: "outlinePrimary" })}>
              ເບິ່ງສິນຄ້າທັງໝົດ
            </Link>
          }
        />
      )}
      <PaginationNav page={products.page} pageSize={products.pageSize} total={products.total} params={{ category: query.category, q: query.q }} />
    </div>
  );
}
