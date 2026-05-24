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
  WifiOff,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/appStore";

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
  const connectionError = useAppStore((s) => s.connectionError);

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
    <aside className="fixed top-0 left-0 h-screen w-[220px] bg-white border-r border-brand-subtle hidden md:flex flex-col z-20">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-brand-subtle">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-slate-900 font-bold text-sm tracking-tight">
            tradrNotebook
          </span>
        </Link>
      </div>

      {/* Connection banner */}
      {connectionError === "offline" && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-slate-100 border border-slate-300">
          <div className="flex items-center gap-2">
            <WifiOff size={13} className="text-slate-500 shrink-0" />
            <p className="text-xs text-slate-600 font-medium leading-snug">
              No internet connection
            </p>
          </div>
        </div>
      )}
      {connectionError === "warming" && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <p className="text-xs text-amber-700 font-medium leading-snug">
              Backend warming up. Please wait…
            </p>
          </div>
        </div>
      )}

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
