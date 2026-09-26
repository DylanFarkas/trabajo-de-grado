import { notFound } from "next/navigation";

import { CategoryForm } from "@/app/(admin)/categories/category-form";
import { PageHeader } from "@/components/layout/page-header";
import { toneLabel } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: category }, { data: assigned }] = await Promise.all([
    supabase.from("categories").select("id, name, description, tone, sort_order, active").eq("id", id).maybeSingle(),
    supabase.from("place_categories").select("place_id").eq("category_id", id),
  ]);

  if (!category) notFound();

  const placeIds = (assigned ?? []).map((row) => row.place_id as string);
  const { data: places } =
    placeIds.length > 0
      ? await supabase.from("places").select("id, name, kind").in("id", placeIds).order("name")
      : { data: [] };

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/categories", label: "Categorías" },
          { label: category.id },
        ]}
        title={category.name}
        subtitle={`${category.id} · ${toneLabel(category.tone)}`}
      />
      <CategoryForm category={category} places={places ?? []} />
    </>
  );
}
