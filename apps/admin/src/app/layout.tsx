import type { Metadata } from "next";
import { Inter, Noto_Sans_Lao } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const notoSansLao = Noto_Sans_Lao({
  subsets: ["lao"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans-lao",
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "OmniCommerce AI · Admin",
  description: "OmniCommerce AI back-office",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="lo" className={`${notoSansLao.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
