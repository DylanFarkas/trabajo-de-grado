import { notFound, redirect } from "next/navigation";

import { RouteForm } from "@/app/routes/route-form";
import { Shell } from "@/app/shell";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function RoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") redirect("/");

  const { id } = await params;
  const routeId = Number(id);
  if (!Number.isFinite(routeId)) notFound();

  const supabase = await createClient();
  const [{ data: route, error }, { data: places, error: placesError }] = await Promise.all([
    supabase.from("routes").select("id, name, description, published, route_stops(place_id, position)").eq("id", routeId).maybeSingle(),
    supabase.from("places").select("id, name, kind").order("name"),
  ]);

  if (error) {
    return (
      <Shell>
        <p className="text-sm text-red-700">{error.message}</p>
      </Shell>
    );
  }
  if (!route) notFound();

  const stops = [...(route.route_stops ?? [])].sort((a, b) => a.position - b.position);

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">{route.name}</h1>
      {placesError ? <p className="mt-4 text-sm text-red-700">{placesError.message}</p> : null}
      <RouteForm
        routeId={route.id}
        name={route.name}
        description={route.description ?? ""}
        published={route.published}
        stopIds={stops.map((stop) => stop.place_id)}
        places={places ?? []}
      />
    </Shell>
  );
}
