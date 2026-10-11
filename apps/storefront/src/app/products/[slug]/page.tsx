import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { productsHref } from "@/components/pagination-nav";
import { ProductGallery } from "@/components/product-gallery";
import { VariantPicker } from "@/components/variant-picker";
import { getProduct } from "@/lib/store-api";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "ບໍ່ພົບສິນຄ້າ", robots: { index: false } };
  const description = product.description?.replace(/\s+/g, " ").trim().slice(0, 160) || undefined;
  const image = product.images[0]?.url;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  return (
    <article className="flex flex-col gap-4">
      <nav aria-label="ເສັ້ນທາງ" className="text-sm text-ink-secondary">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/products" className="hover:text-brand-ink hover:underline">
              ສິນຄ້າ
            </Link>
          </li>
          {product.category ? (
            <li className="flex items-center gap-1">
              <ChevronRight className="size-3.5" aria-hidden="true" />
              <Link href={productsHref({ category: product.category.slug })} className="hover:text-brand-ink hover:underline">
                {product.category.name}
              </Link>
            </li>
          ) : null}
        </ol>
      </nav>

      <div className="grid gap-6 md:grid-cols-2">
        <ProductGallery images={product.images} productName={product.name} />
        <div className="flex flex-col gap-5">
          <h1 className="text-2xl font-bold text-ink">{product.name}</h1>
          <VariantPicker product={product} />
          {product.description ? (
            <section aria-labelledby="description-heading" className="border-t border-line pt-4">
              <h2 id="description-heading" className="mb-2 text-sm font-semibold text-ink">
                ລາຍລະອຽດສິນຄ້າ
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-secondary">{product.description}</p>
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}
