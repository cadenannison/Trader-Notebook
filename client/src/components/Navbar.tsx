"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { clsx } from "clsx";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-zinc-100 font-semibold text-lg tracking-tight">
          Trader<span className="text-emerald-400">Notebook</span>
        </Link>
        <div className="flex items-center gap-6">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "text-sm transition-colors",
                pathname === href ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
