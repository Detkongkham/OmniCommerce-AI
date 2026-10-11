import type { StoreProductListItem } from "@/lib/types";
import { ProductCard } from "./product-card";

export function ProductGrid({ products }: { products: StoreProductListItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.slug}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
