import { RouteForm } from "@/app/(admin)/routes/route-form";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function NewRoutePage() {
  const supabase = await createClient();
  const { data: places, error } = await supabase.from("places").select("id, name, kind").order("name");

  return (
    <>
      <PageHeader title="Nueva ruta" />
      <QueryError message={error?.message} />
      <RouteForm name="" description="" published={false} stopIds={[]} places={places ?? []} />
    </>
  );
}
