import { Search, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CartLink } from "./cart-link";

/** ຫົວເວັບ: ຊື່ຮ້ານ + ຄົ້ນຫາ (ຟອມ GET ໄປ /products ໃຊ້ໄດ້ໂດຍບໍ່ຕ້ອງມີ JavaScript) + ບັນຊີ + ກະຕ່າ */
export function SiteHeader({ storeName, query }: { storeName: string; query?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-chrome-line bg-chrome/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Image src="/oca-mark.png" alt="" width={32} height={32} priority />
          <span className="max-w-[40vw] truncate text-base font-bold text-brand-deep sm:max-w-none">{storeName}</span>
        </Link>
        <form action="/products" role="search" className="ml-auto flex w-full max-w-xs items-center">
          <label htmlFor="site-search" className="sr-only">
            ຄົ້ນຫາສິນຄ້າ
          </label>
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input
              id="site-search"
              type="search"
              name="q"
              defaultValue={query}
              maxLength={100}
              placeholder="ຄົ້ນຫາສິນຄ້າ"
              className="h-9 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </form>
        <Link
          href="/account"
          className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-ink transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserRound className="size-5" aria-hidden="true" />
          <span className="sr-only text-sm font-medium sm:not-sr-only">ບັນຊີ</span>
        </Link>
        <CartLink />
      </div>
    </header>
  );
}
