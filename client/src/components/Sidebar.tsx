"use client";

import { useEffect, useState } from "react";
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
  Settings,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const mainNav = [
  { href: "/", label: "Chat", icon: MessageSquare },
  { href: "/notebook", label: "Notebook", icon: BookOpen },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/stats", label: "Stats", icon: BarChart2 },
];

function BrandMark() {
  return (
    <div className="w-9 h-9 rounded-[7px] border-[1.5px] border-brand flex items-center justify-center shrink-0 relative overflow-hidden">
      <span
        className="text-brand font-bold text-sm leading-none select-none"
        style={{ letterSpacing: "-0.03em" }}
      >
        tN
      </span>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-brand text-white"
          : "text-slate-500 hover:bg-brand-light hover:text-brand"
      )}
    >
      <Icon size={16} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const name =
        data.user.user_metadata?.username ||
        data.user.email?.split("@")[0] ||
        "";
      setDisplayName(name);
    });
  }, []);

  return (
    <aside className="fixed top-0 left-0 h-screen w-[220px] bg-white border-r border-brand-subtle flex flex-col z-20">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-brand-subtle">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-slate-900 font-bold text-sm tracking-tight">
            tradrNotebook
          </span>
        </Link>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {mainNav.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={pathname === href}
          />
        ))}
      </nav>

      {/* Bottom: user + Settings */}
      <div className="px-3 py-4 border-t border-brand-subtle space-y-1">
        {displayName && (
          <div className="px-3 py-1.5 mb-1">
            <p className="text-xs font-semibold text-slate-700 truncate">
              @{displayName}
            </p>
          </div>
        )}
        <NavItem
          href="/settings"
          label="Settings"
          icon={Settings}
          active={pathname === "/settings"}
        />
      </div>
    </aside>
  );
}
