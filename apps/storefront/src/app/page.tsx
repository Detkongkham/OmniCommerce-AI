import { EmptyState, buttonVariants } from "@oca/ui";
import { PackageOpen } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { CategoryNav } from "@/components/category-nav";
import { ProductGrid } from "@/components/product-grid";
import { listCategories, listProducts } from "@/lib/store-api";

const HOME_PRODUCT_COUNT = 8;

export default async function HomePage() {
  await connection();
  const [products, categories] = await Promise.all([listProducts({}), listCategories()]);
  const latest = products.items.slice(0, HOME_PRODUCT_COUNT);

  return (
    <div className="flex flex-col gap-6">
      <CategoryNav categories={categories} />
      <section aria-labelledby="latest-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h1 id="latest-heading" className="text-xl font-bold text-ink">
            ສິນຄ້າມາໃໝ່
          </h1>
          {products.total > latest.length ? (
            <Link href="/products" className="text-sm font-medium text-brand-ink underline-offset-4 hover:underline">
              ເບິ່ງທັງໝົດ ({products.total})
            </Link>
          ) : null}
        </div>
        {latest.length > 0 ? (
          <ProductGrid products={latest} />
        ) : (
          <EmptyState icon={PackageOpen} title="ຍັງບໍ່ມີສິນຄ້າ" description="ຮ້ານກຳລັງກຽມສິນຄ້າ ກະລຸນາກັບມາເບິ່ງໃໝ່" />
        )}
      </section>
      {products.total > latest.length ? (
        <div className="flex justify-center">
          <Link href="/products" className={buttonVariants({ variant: "outlinePrimary", size: "lg" })}>
            ເບິ່ງສິນຄ້າທັງໝົດ
          </Link>
        </div>
      ) : null}
    </div>
  );
}
