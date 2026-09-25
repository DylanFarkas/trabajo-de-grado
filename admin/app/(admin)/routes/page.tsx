import Link from "next/link";

import { LinkList } from "@/components/catalog/link-list";
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
      <PageHeader title="Rutas">
        <Link className={buttonClass("primary")} href="/routes/new">
          Nueva ruta
        </Link>
      </PageHeader>
      <QueryError message={error?.message} />
      <LinkList
        items={(routes ?? []).map((route) => {
          const stops = Array.isArray(route.route_stops) ? route.route_stops.length : 0;
          return {
            href: `/routes/${route.id}`,
            title: route.name,
            meta: `${stops} ${stops === 1 ? "sitio" : "sitios"} · ${route.published ? "Publicada" : "Borrador"}`,
          };
        })}
      />
    </>
  );
}
