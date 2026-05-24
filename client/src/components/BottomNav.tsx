"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { clsx } from "clsx";
import {
  BarChart2,
  Bell,
  BookOpen,
  Eye,
  MessageSquare,
  Newspaper,
} from "lucide-react";

const items = [
  { href: "/", label: "Chat", icon: MessageSquare },
  { href: "/notebook", label: "Notebook", icon: BookOpen },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/stats", label: "Stats", icon: BarChart2 },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 md:hidden bg-white border-t border-brand-subtle flex">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors",
              active ? "text-brand" : "text-slate-400"
            )}
          >
            <Icon size={18} strokeWidth={active ? 2.5 : 2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
