import { notFound } from "next/navigation";

import { RouteForm } from "@/app/(admin)/routes/route-form";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function RoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const routeId = Number(id);
  if (!Number.isFinite(routeId)) notFound();

  const supabase = await createClient();
  const [{ data: route, error }, { data: places, error: placesError }] = await Promise.all([
    supabase.from("routes").select("id, name, description, published, route_stops(place_id, position)").eq("id", routeId).maybeSingle(),
    supabase.from("places").select("id, name, kind").order("name"),
  ]);

  if (error) {
    return <QueryError message={error.message} />;
  }
  if (!route) notFound();

  const stops = [...(route.route_stops ?? [])].sort((a, b) => a.position - b.position);

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/routes", label: "Rutas" },
          { label: route.name },
        ]}
        title={route.name}
        subtitle={route.published ? "Publicada. La app la muestra si tiene al menos dos sitios." : "Borrador. Aún no se muestra en la app."}
      />
      <QueryError message={placesError?.message} />
      <RouteForm
        routeId={route.id}
        name={route.name}
        description={route.description ?? ""}
        published={route.published}
        stopIds={stops.map((stop) => stop.place_id)}
        places={places ?? []}
      />
    </>
  );
}
