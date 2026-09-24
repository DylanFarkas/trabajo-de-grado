import Link from "next/link";
import { redirect } from "next/navigation";

import { Shell } from "@/app/shell";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/");
  if (profile.role !== "admin") redirect("/");

  const { q = "" } = await searchParams;
  const needle = q.trim().replace(/[,.()%_]/g, "");
  const supabase = await createClient();
  let query = supabase.from("places").select("id, name, kind").order("id");
  if (needle) {
    query = query.or(`id.ilike.%${needle}%,name.ilike.%${needle}%`);
  }
  const { data: places, error } = await query;

  return (
    <Shell>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Edificios</h1>
        <form>
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            name="q"
            defaultValue={needle}
            placeholder="Código o nombre"
          />
        </form>
      </div>
      {error ? <p className="mt-4 text-sm text-red-700">{error.message}</p> : null}
      <ul className="mt-6 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        {(places ?? []).map((place) => (
          <li key={place.id}>
            <Link className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-zinc-50" href={`/places/${place.id}`}>
              <span className="font-medium">{place.name}</span>
              <span className="text-sm text-zinc-500">{place.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
