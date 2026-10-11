import { cn } from "@oca/ui";
import Link from "next/link";
import type { StoreCategory } from "@/lib/types";
import { productsHref } from "./pagination-nav";

interface CategoryNavProps {
  categories: StoreCategory[];
  /** slug ຂອງໝວດໝູ່ທີ່ເລືອກ; undefined = ທັງໝົດ */
  active?: string;
  /** ຮັກສາຄຳຄົ້ນຫາເມື່ອປ່ຽນໝວດໝູ່ */
  q?: string;
}

/** ແຖບໝວດໝູ່ເລື່ອນຂວາງໄດ້ (ມືຖື) */
export function CategoryNav({ categories, active, q }: CategoryNavProps) {
  if (categories.length === 0) return null;
  const chip = (selected: boolean) =>
    cn(
      "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      selected ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:border-brand-soft-line hover:bg-brand-soft",
    );
  return (
    <nav aria-label="ໝວດໝູ່ສິນຄ້າ" className="-mx-4 overflow-x-auto px-4 py-1">
      <ul className="flex gap-2">
        <li>
          <Link href={productsHref({ q })} aria-current={active ? undefined : "page"} className={chip(!active)}>
            ທັງໝົດ
          </Link>
        </li>
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={productsHref({ category: category.slug, q })}
              aria-current={active === category.slug ? "page" : undefined}
              className={chip(active === category.slug)}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
