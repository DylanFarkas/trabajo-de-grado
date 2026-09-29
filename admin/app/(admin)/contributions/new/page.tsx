import { ContributionForm } from "@/app/(admin)/contributions/contribution-form";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function NewContributionPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const { place } = await searchParams;
  const supabase = await createClient();
  const { data: places, error } = await supabase.from("places").select("id, name").order("id");
  const defaultPlaceId = places?.some((row) => row.id === place) ? place : undefined;

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/contributions", label: "Información" },
          { label: "Nueva" },
        ]}
        title="Agregar información"
        subtitle="Texto contextual de un espacio. Como lo registra un admin, queda publicado."
      />
      <QueryError message={error?.message} />
      <div className="mt-8 max-w-2xl">
        <ContributionForm places={places ?? []} defaultPlaceId={defaultPlaceId} />
      </div>
    </>
  );
}
