"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building, Route, Tag, type LucideIcon } from "lucide-react";

import { CollapsibleLabel } from "@/components/layout/collapsible-label";

const items: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/places", label: "Edificios", icon: Building },
  { href: "/categories", label: "Categorías", icon: Tag },
  { href: "/routes", label: "Rutas", icon: Route },
];

export function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-[#35343c] dark:text-zinc-50"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            }`}
          >
            <Icon size={18} strokeWidth={1.75} className="shrink-0" />
            <CollapsibleLabel collapsed={collapsed}>{item.label}</CollapsibleLabel>
          </Link>
        );
      })}
    </nav>
  );
}
