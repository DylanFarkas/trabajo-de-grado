"use client";

import { Moon, Sun } from "lucide-react";

import { CollapsibleLabel } from "@/components/layout/collapsible-label";
import { Button } from "@/components/ui/button";

const storageKey = "theme";

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  function toggle() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(storageKey, next);
  }

  return (
    <Button variant="ghost" type="button" onClick={toggle} title={collapsed ? "Cambiar tema" : undefined}>
      <Moon className="shrink-0 dark:hidden" size={18} strokeWidth={1.75} />
      <Sun className="hidden shrink-0 dark:block" size={18} strokeWidth={1.75} />
      <CollapsibleLabel collapsed={collapsed}>
        <span className="dark:hidden">Oscuro</span>
        <span className="hidden dark:inline">Claro</span>
      </CollapsibleLabel>
    </Button>
  );
}
