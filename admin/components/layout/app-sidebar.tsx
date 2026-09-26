"use client";

import { LogOut, Map, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useLayoutEffect, useState } from "react";

import { signOut } from "@/app/actions";
import { CollapsibleLabel } from "@/components/layout/collapsible-label";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/auth";

const storageKey = "sidebar-collapsed";

export function AppSidebar({ profile }: { profile: Profile | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    if (localStorage.getItem(storageKey) === "1") setCollapsed(true);
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-white/10 dark:bg-[#0A0A0A]",
        animate && "transition-[width] duration-300 ease-in-out",
        collapsed ? "w-17" : "w-60",
      )}
    >
      <div className="flex items-center px-6 pb-6 pt-7">
        <span
          className={cn(
            "grid min-w-0 transition-[grid-template-columns,opacity] duration-300 ease-in-out",
            collapsed ? "grid-cols-[0fr] opacity-0" : "flex-1 grid-cols-[1fr] opacity-100",
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5 overflow-hidden">
            <Map size={20} strokeWidth={1.75} className="shrink-0 text-zinc-900 dark:text-zinc-100" />
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Rutas Univalle
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir menú" : "Recoger menú"}
          title={collapsed ? "Expandir menú" : "Recoger menú"}
          className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
        >
          <CollapseIcon size={20} strokeWidth={1.5} />
        </button>
      </div>
      {profile?.role === "admin" ? <SidebarNav collapsed={collapsed} /> : null}
      <div className="mt-auto px-3 pb-5">
        <ThemeToggle collapsed={collapsed} />
        {profile ? (
          <>
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
                collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
              )}
            >
              <p
                className="min-h-0 overflow-hidden truncate px-3 pb-1 pt-3 text-xs text-zinc-400 dark:text-zinc-500"
                title={profile.email ?? undefined}
              >
                {profile.email}
              </p>
            </div>
            <form action={signOut}>
              <Button variant="ghost" type="submit" title={collapsed ? "Salir" : undefined}>
                <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
                <CollapsibleLabel collapsed={collapsed}>Salir</CollapsibleLabel>
              </Button>
            </form>
          </>
        ) : null}
      </div>
    </aside>
  );
}
