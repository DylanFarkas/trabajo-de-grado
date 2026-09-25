import { GoogleButton } from "@/components/auth/google-button";
import { NavCard } from "@/components/catalog/nav-card";
import { PageHeader } from "@/components/layout/page-header";
import { Shell } from "@/components/layout/shell";
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
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          Google no devolvió una sesión. Revisa que `http://localhost:3000/auth/callback` esté en las Redirect URLs de Supabase.
        </p>
      ) : null}
      {!profile ? (
        <section className="max-w-md">
          <PageHeader
            crumbs={[{ label: "Inicio" }]}
            title="Entrar al panel"
            subtitle="El login es con Google. Solo una cuenta con rol admin puede editar el catálogo."
          />
          <div className="mt-6">
            <GoogleButton />
          </div>
        </section>
      ) : profile.role !== "admin" ? (
        <section className="max-w-lg">
          <PageHeader
            crumbs={[{ label: "Inicio" }]}
            title="Esta cuenta no es admin"
            subtitle={`Entraste como ${profile.email}. El rol se asigna en la base, no desde este panel.`}
          />
          <pre className="mt-6 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100 dark:bg-black dark:ring-1 dark:ring-zinc-800">{`update public.profiles
set role = 'admin'
where email = '${profile.email ?? ""}';`}</pre>
        </section>
      ) : (
        <section>
          <PageHeader
            crumbs={[{ label: "Inicio" }]}
            title={`Hola${profile.full_name ? `, ${profile.full_name}` : ""}`}
            subtitle="Edita fichas de edificios, categorías y rutas con sus sitios."
          />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <NavCard href="/places" title="Edificios" description="Lista y fichas. Ahí se asignan las categorías." />
            <NavCard href="/categories" title="Categorías" description="Lista y fichas. Se asignan en cada edificio." />
            <NavCard href="/routes" title="Rutas" description="Crea rutas personalizadas." />
          </div>
        </section>
      )}
    </Shell>
  );
}
