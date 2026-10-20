import { notFound } from "next/navigation";

import { extendClosure, resolveClosure } from "@/app/actions";
import { ClosureMap } from "@/app/(admin)/closures/closure-map";
import { StatusPill } from "@/components/catalog/status-pill";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/input";
import {
  CLOSURE_DURATIONS,
  CLOSURE_NOTE_MAX,
  CLOSURE_OPEN_STATUSES,
  closureCategoryLabel,
  closureStatusLabel,
  closureStatusTone,
} from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Person = { full_name: string | null; email: string | null; reputation?: number } | null;

type Detail = {
  id: number;
  source: "community" | "admin";
  category: string;
  description: string;
  status: string;
  on_site_report: boolean;
  position_source: string;
  estimated_hours: number | null;
  confirm_score: number;
  deny_score: number;
  review_note: string | null;
  resolved_at: string | null;
  confirmed_at: string | null;
  last_confirmed_at: string | null;
  expires_at: string;
  created_at: string;
  closure_segments: { segment_key: string }[];
  reporter: Person;
  resolver: Person;
};

type Vote = {
  vote: "still_closed" | "now_open";
  on_site: boolean;
  position_source: string;
  updated_at: string;
  voter: Person;
};

const cardClass = "grid gap-4 rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]";

export default async function ClosurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: votes }] = await Promise.all([
    supabase
      .from("road_closures")
      .select(
        "id, source, category, description, status, on_site_report, position_source, estimated_hours, confirm_score, deny_score, review_note, resolved_at, confirmed_at, last_confirmed_at, expires_at, created_at, closure_segments(segment_key), reporter:profiles!reported_by(full_name, email, reputation), resolver:profiles!resolved_by(full_name, email)",
      )
      .eq("id", numericId)
      .maybeSingle()
      .overrideTypes<Detail, { merge: false }>(),
    supabase
      .from("closure_votes")
      .select("vote, on_site, position_source, updated_at, voter:profiles!voter_id(full_name, email)")
      .eq("closure_id", numericId)
      .order("updated_at", { ascending: false })
      .overrideTypes<Vote[], { merge: false }>(),
  ]);
  if (!data) notFound();

  const person = (row: Person) => row?.full_name ?? row?.email ?? "—";
  const expired = new Date(data.expires_at) <= new Date();
  const open = (CLOSURE_OPEN_STATUSES as readonly string[]).includes(data.status) && !expired;
  const status = (CLOSURE_OPEN_STATUSES as readonly string[]).includes(data.status) && expired ? "expired" : data.status;
  const segmentKeys = data.closure_segments.map((segment) => segment.segment_key);
  const community = data.source === "community";

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/closures", label: "Vías cerradas" },
          { label: `#${data.id}` },
        ]}
        title={`${closureCategoryLabel(data.category)} · ${segmentKeys.length === 1 ? "1 tramo" : `${segmentKeys.length} tramos`}`}
        subtitle={community ? `Reporte de ${person(data.reporter)}` : "Cierre de la universidad"}
      >
        <StatusPill tone={closureStatusTone(status)}>{closureStatusLabel(status)}</StatusPill>
      </PageHeader>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="grid gap-6">
          <ClosureMap focus={segmentKeys} className="h-96" />

          <section className={cardClass}>
            <h2 className="text-lg font-semibold tracking-tight">Reporte</h2>
            <p className="text-zinc-800 dark:text-zinc-100">{data.description}</p>
            <dl className="grid gap-1 text-sm text-zinc-500 dark:text-zinc-400">
              <div>Creado: {formatDateTime(data.created_at)}</div>
              {community ? (
                <div>
                  {data.on_site_report ? "Reportado en el sitio" : "Reportado a distancia"} · posición{" "}
                  {data.position_source === "gps" ? "GPS" : "simulada (modo prueba)"}
                  {data.reporter?.reputation != null ? ` · reputación del autor ${data.reporter.reputation}` : ""}
                </div>
              ) : null}
              {data.estimated_hours ? <div>Duración estimada: {data.estimated_hours} h</div> : null}
              {data.confirmed_at ? <div>Confirmado: {formatDateTime(data.confirmed_at)}</div> : null}
              {data.last_confirmed_at ? <div>Última confirmación: {formatDateTime(data.last_confirmed_at)}</div> : null}
              <div>
                {open ? "Vence" : "Venció o se cerró"}: {formatDateTime(open ? data.expires_at : (data.resolved_at ?? data.expires_at))}
              </div>
              {data.resolved_at && data.resolver ? (
                <div>
                  Resuelto por {person(data.resolver)} el {formatDateTime(data.resolved_at)}
                </div>
              ) : null}
              {data.review_note ? <div>Nota: {data.review_note}</div> : null}
            </dl>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold tracking-tight">
              Votos <span className="text-sm font-normal text-zinc-500">+{data.confirm_score} / −{data.deny_score}</span>
            </h2>
            {votes && votes.length > 0 ? (
              <ul className="grid gap-2 text-sm">
                {votes.map((vote, index) => (
                  <li key={index} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-zinc-800 dark:text-zinc-100">{person(vote.voter)}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {vote.vote === "still_closed" ? "Sigue cerrada" : "Ya está abierta"} ·{" "}
                      {vote.on_site ? "en el sitio" : "a distancia"}
                      {vote.position_source === "simulated" ? " (prueba)" : ""} · {formatDateTime(vote.updated_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Nadie ha votado todavía.</p>
            )}
          </section>
        </div>

        <div className="grid gap-6">
          {open ? (
            <section className={cardClass}>
              <h2 className="text-lg font-semibold tracking-tight">Resolver</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {community
                  ? "Normalmente no hace falta: los votos confirman o reabren solos. Úsalo para excepciones."
                  : "Termina el cierre antes de tiempo si la vía ya está abierta."}
              </p>
              <form action={resolveClosure} className="grid gap-3">
                <input type="hidden" name="id" value={data.id} />
                <Field>
                  Nota
                  <Textarea
                    name="review_note"
                    maxLength={CLOSURE_NOTE_MAX}
                    defaultValue={data.review_note ?? ""}
                    className="min-h-20 dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]"
                    placeholder="Opcional. Si rechazas un reporte, el autor ve esta nota en la app."
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {community && data.status !== "confirmed" ? (
                    <Button className="cursor-pointer" name="decision" size="lg" type="submit" value="confirmed">
                      Confirmar cierre
                    </Button>
                  ) : null}
                  <Button className="cursor-pointer" name="decision" size="lg" type="submit" value="reopened" variant="secondary">
                    {community ? "Ya está abierta" : "Terminar cierre"}
                  </Button>
                  {community ? (
                    <Button className="cursor-pointer" name="decision" size="lg" type="submit" value="rejected" variant="secondary">
                      Rechazar reporte falso
                    </Button>
                  ) : null}
                </div>
              </form>
            </section>
          ) : null}

          {open ? (
            <section className={cardClass}>
              <h2 className="text-lg font-semibold tracking-tight">Extender</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                El cierre seguirá activo desde ahora durante el tiempo que elijas.
              </p>
              <form action={extendClosure} className="grid gap-3">
                <input type="hidden" name="id" value={data.id} />
                <Field>
                  Desde ahora
                  <Select name="duration_hours" defaultValue="24">
                    {CLOSURE_DURATIONS.map((option) => (
                      <option key={option.hours} value={option.hours}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button className="cursor-pointer" size="lg" type="submit" variant="secondary">
                  Extender
                </Button>
              </form>
            </section>
          ) : (
            <section className={cardClass}>
              <h2 className="text-lg font-semibold tracking-tight">Terminado</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Este cierre ya no afecta las rutas. Si la vía vuelve a cerrarse, crea un cierre nuevo.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
