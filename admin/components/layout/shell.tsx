import { LogOut, Map } from "lucide-react";

import { signOut } from "@/app/actions";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSessionProfile } from "@/lib/auth";

export async function Shell({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionProfile();

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-white/10 dark:bg-[#0A0A0A]">
        <div className="flex items-center gap-2.5 px-6 pb-6 pt-7">
          <Map size={20} strokeWidth={1.75} className="shrink-0 text-zinc-900 dark:text-zinc-100" />
          <p className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Rutas Univalle</p>
        </div>
        {profile?.role === "admin" ? <SidebarNav /> : null}
        <div className="mt-auto px-3 pb-5">
          <ThemeToggle />
          {profile ? (
            <>
              <p className="truncate px-3 pb-1 pt-3 text-xs text-zinc-400 dark:text-zinc-500" title={profile.email ?? undefined}>
                {profile.email}
              </p>
              <form action={signOut}>
                <Button variant="ghost" type="submit">
                  <LogOut size={18} strokeWidth={1.75} />
                  Salir
                </Button>
              </form>
            </>
          ) : null}
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
