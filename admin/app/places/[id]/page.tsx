import { notFound, redirect } from "next/navigation";

import { updatePlace } from "@/app/actions";
import { Shell } from "@/app/shell";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const TONE_LABEL: Record<string, string> = {
  food: "Comida",
  sport: "Deporte",
  library: "Biblioteca",
  culture: "Cultura",
  academic: "Facultad",
};

export default async function PlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") redirect("/");

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
    <Shell>
      <p className="text-sm text-zinc-500">{place.id}</p>
      <h1 className="text-2xl font-semibold">{place.name}</h1>
      <form action={updatePlace} className="mt-6 grid max-w-xl gap-4">
        <input type="hidden" name="id" value={place.id} />
        <label className="grid gap-1 text-sm">
          Nombre
          <input className="rounded-lg border border-zinc-300 px-3 py-2" name="name" defaultValue={place.name} required />
        </label>
        <label className="grid gap-1 text-sm">
          Descripción
          <textarea className="min-h-28 rounded-lg border border-zinc-300 px-3 py-2" name="description" defaultValue={place.description ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          Tipo
          <select className="rounded-lg border border-zinc-300 px-3 py-2" name="kind" defaultValue={place.kind}>
            <option value="building">Edificio</option>
            <option value="space">Espacio</option>
          </select>
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Categorías</legend>
          {(categories ?? []).map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="category_id" value={category.id} defaultChecked={selected.has(category.id)} />
              <span>{category.name}</span>
              <span className="text-zinc-500">{TONE_LABEL[category.tone] ?? category.tone}</span>
            </label>
          ))}
        </fieldset>
        <button className="w-fit rounded-full bg-zinc-950 px-5 py-2.5 text-sm text-white" type="submit">
          Guardar ficha
        </button>
      </form>
    </Shell>
  );
}
