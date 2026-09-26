import { notFound } from "next/navigation";

import { PlaceForm } from "@/app/(admin)/places/place-form";
import { PageHeader } from "@/components/layout/page-header";
import { kindLabel } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";

export default async function PlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: place }, { data: categories }, { data: assigned }] = await Promise.all([
    supabase.from("places").select("id, name, kind, description").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id, name, tone, active").eq("active", true).order("sort_order"),
    supabase.from("place_categories").select("category_id").eq("place_id", id),
  ]);

  if (!place) notFound();
  const selected = new Set((assigned ?? []).map((row) => row.category_id as string));

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/places", label: "Edificios" },
          { label: place.id },
        ]}
        title={place.name}
        subtitle={`${place.id} · ${kindLabel(place.kind)}`}
      />
      <PlaceForm place={place} categories={categories ?? []} selected={selected} />
    </>
  );
}
