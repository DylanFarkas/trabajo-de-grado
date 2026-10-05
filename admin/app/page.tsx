import { GoogleButton } from "@/components/auth/google-button";
import { NavCard } from "@/components/catalog/nav-card";
import { PageHeader } from "@/components/layout/page-header";
import { Shell } from "@/components/layout/shell";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getSessionProfile();
  const params = await searchParams;
  let pending = 0;
  if (profile?.role === "admin") {
    const supabase = await createClient();
    const { count } = await supabase
      .from("contributions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pending = count ?? 0;
  }

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
            subtitle="Edita fichas de edificios y espacios, información, categorías y rutas."
          />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NavCard href="/places" title="Edificios" description="Lista y fichas. Ahí se asignan las categorías." />
            <NavCard href="/espacios" title="Espacios" description="Parqueaderos, baños y canchas. El punto se define en el mapa." />
            <NavCard
              href="/contributions"
              title="Información"
              description={
                pending > 0
                  ? `${pending} ${pending === 1 ? "aporte pendiente" : "aportes pendientes"} de revisar.`
                  : "Aportes de usuarios y textos de los espacios."
              }
            />
            <NavCard href="/categories" title="Categorías" description="Lista y fichas. Se asignan en cada edificio." />
            <NavCard href="/routes" title="Rutas" description="Crea rutas personalizadas." />
          </div>
        </section>
      )}
    </Shell>
  );
}
