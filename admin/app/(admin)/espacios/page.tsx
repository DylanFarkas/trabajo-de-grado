import { EspaciosTable } from "@/app/(admin)/espacios/espacios-table";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function EspaciosPage() {
  const supabase = await createClient();
  const { data: spaces, error } = await supabase
    .from("places")
    .select("id, name")
    .eq("kind", "space")
    .order("id");

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Inicio" }, { label: "Espacios" }]}
        title="Espacios"
        subtitle="Nombre, descripción y categorías. El punto se define en el mapa, no desde aquí."
      />
      <QueryError message={error?.message} />
      <EspaciosTable spaces={spaces ?? []} />
    </>
  );
}
