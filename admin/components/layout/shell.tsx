import { AppSidebar } from "@/components/layout/app-sidebar";
import { getSessionProfile } from "@/lib/auth";

export async function Shell({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionProfile();

  return (
    <div className="flex min-h-screen bg-white text-zinc-950 dark:bg-[#101010] dark:text-zinc-100">
      <AppSidebar profile={profile} />
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
