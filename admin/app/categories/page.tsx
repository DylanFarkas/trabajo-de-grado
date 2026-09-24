import { redirect } from "next/navigation";

import { createCategory, deleteCategory, updateCategory } from "@/app/actions";
import { Shell } from "@/app/shell";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const TONES = [
  ["food", "Comida"],
  ["sport", "Deporte"],
  ["library", "Biblioteca"],
  ["culture", "Cultura"],
  ["academic", "Facultad"],
] as const;

function ToneSelect({ value }: { value?: string }) {
  return (
    <select className="rounded-lg border border-zinc-300 px-3 py-2" name="tone" defaultValue={value ?? "academic"}>
      {TONES.map(([tone, label]) => (
        <option key={tone} value={tone}>
          {label}
        </option>
      ))}
    </select>
  );
}

export default async function CategoriesPage() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name, description, tone, sort_order, active")
    .order("sort_order");

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Categorías</h1>
      {error ? <p className="mt-4 text-sm text-red-700">{error.message}</p> : null}

      <form action={createCategory} className="mt-6 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-6">
        <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" name="id" placeholder="id, ej. cafeteria" required />
        <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2" name="name" placeholder="Nombre" required />
        <ToneSelect />
        <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" name="sort_order" type="number" defaultValue={40} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked />
          Activa
        </label>
        <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-5" name="description" placeholder="Descripción" />
        <button className="rounded-full bg-zinc-950 px-4 py-2 text-sm text-white" type="submit">
          Crear
        </button>
      </form>

      <ul className="mt-6 grid gap-3">
        {(categories ?? []).map((category) => (
          <li key={category.id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <form action={updateCategory} className="grid gap-3 md:grid-cols-6">
              <input type="hidden" name="id" value={category.id} />
              <p className="self-center text-sm text-zinc-500">{category.id}</p>
              <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-2" name="name" defaultValue={category.name} required />
              <ToneSelect value={category.tone} />
              <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" name="sort_order" type="number" defaultValue={category.sort_order} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={category.active} />
                Activa
              </label>
              <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm md:col-span-5" name="description" defaultValue={category.description ?? ""} />
              <button className="rounded-full border border-zinc-300 px-4 py-2 text-sm" type="submit">
                Guardar
              </button>
            </form>
            <form action={deleteCategory} className="mt-2">
              <input type="hidden" name="id" value={category.id} />
              <button className="text-sm text-red-700" type="submit">
                Borrar
              </button>
            </form>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
