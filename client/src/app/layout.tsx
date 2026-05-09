import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/Providers";
import { Sidebar } from "@/components/Sidebar";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "tradrNotebook",
  description: "AI-augmented trading journal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-app-bg text-slate-900 min-h-screen`}>
        <Providers>
          <Sidebar />
          <main className="ml-[220px] min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
