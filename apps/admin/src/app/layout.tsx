import { ThemeScript } from "@oca/ui";
import type { Metadata } from "next";
import { Inter, Noto_Sans_Lao } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

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
    <html lang="lo" className={`${notoSansLao.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
