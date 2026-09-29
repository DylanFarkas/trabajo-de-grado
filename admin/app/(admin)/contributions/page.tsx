import Link from "next/link";

import {
  ContributionsTable,
  type ContributionRow,
} from "@/app/(admin)/contributions/contributions-table";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: number;
  place_id: string;
  body: string;
  status: string;
  created_at: string;
  place: { name: string } | null;
  author: { full_name: string | null; email: string | null } | null;
};

export default async function ContributionsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contributions")
    .select(
      "id, place_id, body, status, created_at, place:places(name), author:profiles!author_id(full_name, email)",
    )
    .order("created_at", { ascending: false })
    .overrideTypes<Row[], { merge: false }>();

  const rows: ContributionRow[] = (data ?? []).map((row) => ({
    id: row.id,
    placeId: row.place_id,
    placeName: row.place?.name ?? row.place_id,
    body: row.body,
    author: row.author?.full_name ?? row.author?.email ?? "—",
    status: row.status,
    createdAt: row.created_at,
  }));

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Inicio" }, { label: "Información" }]}
        title="Información"
        subtitle="Aportes de los usuarios y textos de los espacios. Solo lo publicado se ve en la app."
      >
        <Link className={buttonClass("primary", undefined, "lg")} href="/contributions/new">
          Agregar información
        </Link>
      </PageHeader>
      <QueryError message={error?.message} />
      <ContributionsTable rows={rows} />
    </>
  );
}
