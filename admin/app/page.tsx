import Link from "next/link";

import { GoogleButton } from "@/app/google-button";
import { Shell } from "@/app/shell";
import { getSessionProfile } from "@/lib/auth";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getSessionProfile();
  const params = await searchParams;

  return (
    <Shell>
      {params.error === "auth" ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Google no devolvió una sesión. Revisa que `http://localhost:3000/auth/callback` esté en las Redirect URLs de Supabase.
        </p>
      ) : null}
      {!profile ? (
        <section className="max-w-md">
          <h1 className="text-2xl font-semibold">Entrar al panel</h1>
          <p className="mt-2 text-zinc-600">
            El login es con Google. Solo una cuenta con rol admin puede editar el catálogo.
          </p>
          <div className="mt-6">
            <GoogleButton />
          </div>
        </section>
      ) : profile.role !== "admin" ? (
        <section className="max-w-lg">
          <h1 className="text-2xl font-semibold">Esta cuenta no es admin</h1>
          <p className="mt-2 text-zinc-600">
            Entraste como {profile.email}. El rol se asigna en la base, no desde este panel:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100">{`update public.profiles
set role = 'admin'
where email = '${profile.email ?? ""}';`}</pre>
        </section>
      ) : (
        <section>
          <h1 className="text-2xl font-semibold">Hola{profile.full_name ? `, ${profile.full_name}` : ""}</h1>
          <p className="mt-2 text-zinc-600">
            Edita fichas de edificios, categorías y rutas con sus sitios.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Link className="rounded-xl border border-zinc-200 bg-white p-5" href="/places">
              <p className="text-lg font-semibold">Edificios</p>
              <p className="mt-1 text-sm text-zinc-600">Lista y fichas. Ahí se asignan las categorías.</p>
            </Link>
            <Link className="rounded-xl border border-zinc-200 bg-white p-5" href="/categories">
              <p className="text-lg font-semibold">Categorías</p>
              <p className="mt-1 text-sm text-zinc-600">Crear, editar y borrar.</p>
            </Link>
            <Link className="rounded-xl border border-zinc-200 bg-white p-5" href="/routes">
              <p className="text-lg font-semibold">Rutas</p>
              <p className="mt-1 text-sm text-zinc-600">Nombre y sitios en orden. Publicar las muestra en la app.</p>
            </Link>
          </div>
        </section>
      )}
    </Shell>
  );
}
