import { ClosureCreateForm } from "@/app/(admin)/closures/closure-create-form";
import type { BusySegment } from "@/app/(admin)/closures/closure-map";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { CLOSURE_OPEN_STATUSES } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";

type Row = { id: number; status: string; closure_segments: { segment_key: string }[] };

export default async function NewClosurePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("road_closures")
    .select("id, status, closure_segments(segment_key)")
    .in("status", [...CLOSURE_OPEN_STATUSES])
    .gt("expires_at", new Date().toISOString())
    .overrideTypes<Row[], { merge: false }>();

  const busy: BusySegment[] = (data ?? []).flatMap((row) =>
    row.closure_segments.map((segment) => ({
      key: segment.segment_key,
      closureId: row.id,
      status: row.status,
    })),
  );

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/closures", label: "Vías cerradas" },
          { label: "Nuevo" },
        ]}
        title="Cerrar tramos"
        subtitle="Un cierre de la universidad: no necesita votos y bloquea las rutas de inmediato."
      />
      <QueryError message={error?.message} />
      <ClosureCreateForm busy={busy} />
    </>
  );
}
