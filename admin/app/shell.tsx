import Link from "next/link";

import { signOut } from "@/app/actions";
import { getSessionProfile } from "@/lib/auth";

export async function Shell({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionProfile();

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-sm text-zinc-500">Rutas Univalle</p>
            <p className="text-lg font-semibold">Catálogo</p>
          </div>
          {profile ? (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-zinc-600">{profile.email}</span>
              <form action={signOut}>
                <button className="rounded-full border border-zinc-300 px-3 py-1.5" type="submit">
                  Salir
                </button>
              </form>
            </div>
          ) : null}
        </div>
        {profile?.role === "admin" ? (
          <nav className="mx-auto flex max-w-5xl gap-4 px-6 pb-3 text-sm">
            <Link href="/places">Edificios</Link>
            <Link href="/categories">Categorías</Link>
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
