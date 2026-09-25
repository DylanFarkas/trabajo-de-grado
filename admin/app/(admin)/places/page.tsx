import { LinkList } from "@/components/catalog/link-list";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const needle = q.trim().replace(/[,.()%_]/g, "");
  const supabase = await createClient();
  let query = supabase.from("places").select("id, name, kind").order("id");
  if (needle) {
    query = query.or(`id.ilike.%${needle}%,name.ilike.%${needle}%`);
  }
  const { data: places, error } = await query;

  return (
    <>
      <PageHeader title="Edificios">
        <form>
          <Input name="q" defaultValue={needle} placeholder="Código o nombre" />
        </form>
      </PageHeader>
      <QueryError message={error?.message} />
      <LinkList
        items={(places ?? []).map((place) => ({
          href: `/places/${place.id}`,
          title: place.name,
          meta: place.id,
        }))}
      />
    </>
  );
}
