import { PlacesTable } from "@/app/(admin)/places/places-table";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function PlacesPage() {
  const supabase = await createClient();
  const { data: places, error } = await supabase.from("places").select("id, name, kind").order("id");

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Inicio" }, { label: "Edificios" }]}
        title="Edificios"
        subtitle="Lista y fichas. Ahí se asignan las categorías."
      />
      <QueryError message={error?.message} />
      <PlacesTable places={places ?? []} />
    </>
  );
}
