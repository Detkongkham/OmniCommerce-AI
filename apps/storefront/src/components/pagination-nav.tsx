import { buttonVariants } from "@oca/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export interface ProductsParams {
  category?: string;
  q?: string;
  page?: number;
}

/** URL ຂອງໜ້າລາຍການ: ຮັກສາຕົວກັ່ນຕອງ, ໜ້າ 1 ບໍ່ໃສ່ `page` (URL ດຽວຕໍ່ເນື້ອຫາດຽວ ສຳລັບ SEO) */
export function productsHref(params: ProductsParams): string {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.q) query.set("q", params.q);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  return query.size > 0 ? `/products?${query.toString()}` : "/products";
}

interface PaginationNavProps {
  page: number;
  pageSize: number;
  total: number;
  params: Omit<ProductsParams, "page">;
}

export function PaginationNav({ page, pageSize, total, params }: PaginationNavProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="ໜ້າຂອງລາຍການສິນຄ້າ" className="flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={productsHref({ ...params, page: page - 1 })} aria-label="ໜ້າກ່ອນ" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden="true" />
        </Link>
      ) : (
        <span className="size-9" />
      )}
      <span aria-current="page" className="text-sm text-ink-secondary">
        {`ໜ້າ ${page} / ${pages}`}
      </span>
      {page < pages ? (
        <Link href={productsHref({ ...params, page: page + 1 })} aria-label="ໜ້າຖັດໄປ" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span className="size-9" />
      )}
    </nav>
  );
}
