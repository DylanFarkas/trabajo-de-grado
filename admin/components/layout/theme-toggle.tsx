"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const storageKey = "theme";

export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(storageKey, next);
  }

  return (
    <Button variant="ghost" type="button" onClick={toggle}>
      <Moon className="dark:hidden" size={18} strokeWidth={1.75} />
      <Sun className="hidden dark:block" size={18} strokeWidth={1.75} />
      <span className="dark:hidden">Oscuro</span>
      <span className="hidden dark:inline">Claro</span>
    </Button>
  );
}
