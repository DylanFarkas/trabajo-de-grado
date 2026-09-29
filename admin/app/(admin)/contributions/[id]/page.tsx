import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteContribution, reviewContribution } from "@/app/actions";
import { ContributionForm } from "@/app/(admin)/contributions/contribution-form";
import { StatusPill } from "@/components/catalog/status-pill";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { CONTRIBUTION_NOTE_MAX, contributionStatusLabel } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Detail = {
  id: number;
  place_id: string;
  body: string;
  status: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  place: { name: string } | null;
  author: { full_name: string | null; email: string | null } | null;
  reviewer: { full_name: string | null; email: string | null } | null;
};

const cardClass = "grid gap-4 rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]";

export default async function ContributionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("contributions")
    .select(
      "id, place_id, body, status, review_note, created_at, reviewed_at, place:places(name), author:profiles!author_id(full_name, email), reviewer:profiles!reviewer_id(full_name, email)",
    )
    .eq("id", numericId)
    .maybeSingle()
    .overrideTypes<Detail, { merge: false }>();
  if (!data) notFound();

  const person = (row: Detail["author"]) => row?.full_name ?? row?.email ?? "—";
  const tone = data.status === "approved" ? "ok" : data.status === "rejected" ? "danger" : "warn";

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/contributions", label: "Información" },
          { label: `#${data.id}` },
        ]}
        title={data.place?.name ?? data.place_id}
        subtitle={`Aporte #${data.id} · ${data.place_id}`}
      >
        <StatusPill tone={tone}>{contributionStatusLabel(data.status)}</StatusPill>
      </PageHeader>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <ContributionForm contribution={data} />

        <div className="grid gap-6">
          <section className={cardClass}>
            <h2 className="text-lg font-semibold tracking-tight">Revisión</h2>
            <dl className="grid gap-1 text-sm text-zinc-500 dark:text-zinc-400">
              <div>
                Autor: <span className="text-zinc-900 dark:text-zinc-100">{person(data.author)}</span>
              </div>
              <div>Enviada: {formatDate(data.created_at)}</div>
              {data.reviewed_at ? (
                <div>
                  Revisada: {formatDate(data.reviewed_at)} por {person(data.reviewer)}
                </div>
              ) : null}
            </dl>

            <form action={reviewContribution} className="grid gap-3">
              <input type="hidden" name="id" value={data.id} />
              <Field>
                Nota para el autor
                <Textarea
                  name="review_note"
                  className="min-h-20 dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]"
                  defaultValue={data.review_note ?? ""}
                  maxLength={CONTRIBUTION_NOTE_MAX}
                  placeholder="Opcional. Si rechazas, explica el motivo: el autor lo ve en la app."
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {data.status !== "approved" ? (
                  <Button className="cursor-pointer" name="decision" size="lg" type="submit" value="approved">
                    Aprobar y publicar
                  </Button>
                ) : null}
                {data.status !== "rejected" ? (
                  <Button className="cursor-pointer" name="decision" size="lg" type="submit" value="rejected" variant="secondary">
                    Rechazar
                  </Button>
                ) : null}
                {data.status !== "pending" ? (
                  <Button className="cursor-pointer" name="decision" size="lg" type="submit" value="pending" variant="secondary">
                    Volver a pendiente
                  </Button>
                ) : null}
              </div>
            </form>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold tracking-tight">Eliminar</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Borra este registro de forma definitiva. Si solo quieres ocultarlo de la app, devuélvelo a pendiente.
            </p>
            <form action={deleteContribution} className="flex items-center gap-4">
              <input type="hidden" name="id" value={data.id} />
              <Button className="cursor-pointer" type="submit" variant="danger">
                Borrar información
              </Button>
              <Link className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200" href={`/places/${data.place_id}`}>
                Ver edificio
              </Link>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
