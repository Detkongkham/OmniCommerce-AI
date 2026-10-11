import type { Metadata } from "next";
import { Inter, Noto_Sans_Lao } from "next/font/google";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteUrl } from "@/lib/site";
import { getStoreName } from "@/lib/store-config";
import "./globals.css";

const notoSansLao = Noto_Sans_Lao({
  subsets: ["lao"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans-lao",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  // ຂໍ້ມູນຮ້ານມາຈາກ API ຕອນມີຄຳຂໍ (build ບໍ່ຕ້ອງມີ API)
  await connection();
  const name = await getStoreName();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: name, template: `%s | ${name}` },
    description: `ຊື້ສິນຄ້າອອນລາຍຈາກ ${name}`,
    openGraph: { type: "website", siteName: name, locale: "lo_LA" },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const storeName = await getStoreName();
  return (
    <html lang="lo" className={`${notoSansLao.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col bg-app text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
        >
          ຂ້າມໄປເນື້ອຫາ
        </a>
        <SiteHeader storeName={storeName} />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
        <SiteFooter storeName={storeName} />
      </body>
    </html>
  );
}
