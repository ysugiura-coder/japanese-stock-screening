import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "./components/Navigation";

export const metadata: Metadata = {
  title: "国内株スクリーニング",
  description: "国内株式市場の銘柄をスクリーニングするアプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <Navigation />
          {children}
        </Providers>
      </body>
    </html>
  );
}
