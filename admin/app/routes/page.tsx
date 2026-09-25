import Link from "next/link";
import { redirect } from "next/navigation";

import { Shell } from "@/app/shell";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function RoutesPage() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data: routes, error } = await supabase
    .from("routes")
    .select("id, name, published, route_stops(place_id)")
    .order("name");

  return (
    <Shell>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Rutas</h1>
        <Link className="rounded-full bg-zinc-950 px-4 py-2 text-sm text-white" href="/routes/new">
          Nueva ruta
        </Link>
      </div>
      {error ? <p className="mt-4 text-sm text-red-700">{error.message}</p> : null}
      <ul className="mt-6 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        {(routes ?? []).map((route) => {
          const stops = Array.isArray(route.route_stops) ? route.route_stops.length : 0;
          return (
            <li key={route.id}>
              <Link className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-zinc-50" href={`/routes/${route.id}`}>
                <span className="font-medium">{route.name}</span>
                <span className="text-sm text-zinc-500">
                  {stops} {stops === 1 ? "sitio" : "sitios"} · {route.published ? "Publicada" : "Borrador"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
