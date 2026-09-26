import Link from "next/link";

import { RoutesTable } from "@/app/(admin)/routes/routes-table";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function RoutesPage() {
  const supabase = await createClient();
  const { data: routes, error } = await supabase
    .from("routes")
    .select("id, name, published, route_stops(place_id)")
    .order("name");

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Inicio" }, { label: "Rutas" }]}
        title="Rutas"
        subtitle="Crea rutas personalizadas."
      >
        <Link className={buttonClass("primary")} href="/routes/new">
          Nueva ruta
        </Link>
      </PageHeader>
      <QueryError message={error?.message} />
      <RoutesTable
        routes={(routes ?? []).map((route) => ({
          id: route.id,
          name: route.name,
          published: route.published,
          stops: Array.isArray(route.route_stops) ? route.route_stops.length : 0,
        }))}
      />
    </>
  );
}
