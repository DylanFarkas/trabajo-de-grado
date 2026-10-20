import Link from "next/link";

import { ClosuresTable, type ClosureRow } from "@/app/(admin)/closures/closures-table";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/ui/button";
import { CLOSURE_OPEN_STATUSES } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: number;
  source: "community" | "admin";
  category: string;
  description: string;
  status: string;
  confirm_score: number;
  deny_score: number;
  created_at: string;
  expires_at: string;
  closure_segments: { segment_key: string }[];
  reporter: { full_name: string | null; email: string | null; reputation: number } | null;
};

const TABS = [
  { id: "attention", label: "Requieren atención" },
  { id: "active", label: "Activos" },
  { id: "provisional", label: "Provisionales" },
  { id: "history", label: "Historial" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const PROVISIONAL_STALE_MS = 2 * 60 * 60 * 1000;
const REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isTab(value: string | undefined): value is Tab {
  return TABS.some((tab) => tab.id === value);
}

export default async function ClosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: Tab = isTab(params.tab) ? params.tab : "attention";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("road_closures")
    .select(
      "id, source, category, description, status, confirm_score, deny_score, created_at, expires_at, closure_segments(segment_key), reporter:profiles!reported_by(full_name, email, reputation)",
    )
    .order("created_at", { ascending: false })
    .limit(300)
    .overrideTypes<Row[], { merge: false }>();

  const now = new Date().getTime();
  const rows = data ?? [];
  const open = (row: Row) =>
    (CLOSURE_OPEN_STATUSES as readonly string[]).includes(row.status) && new Date(row.expires_at).getTime() > now;

  // Tramos que la comunidad reportó dos o más veces en la última semana.
  const recentBySegment = new Map<string, number>();
  for (const row of rows) {
    if (row.source !== "community" || now - new Date(row.created_at).getTime() > REPEAT_WINDOW_MS) continue;
    for (const segment of row.closure_segments) {
      recentBySegment.set(segment.segment_key, (recentBySegment.get(segment.segment_key) ?? 0) + 1);
    }
  }

  const reasonsFor = (row: Row): string[] => {
    if (!open(row)) return [];
    const reasons: string[] = [];
    if (row.status === "confirmed" && row.deny_score > 0) reasons.push("Votos de que ya está abierta");
    if (row.status === "provisional" && now - new Date(row.created_at).getTime() > PROVISIONAL_STALE_MS) {
      reasons.push("Más de 2 h sin confirmarse");
    }
    if (row.source === "community" && (row.reporter?.reputation ?? 0) < 0) reasons.push("Autor con reputación negativa");
    if (row.closure_segments.some((segment) => (recentBySegment.get(segment.segment_key) ?? 0) >= 2)) {
      reasons.push("Tramo reportado varias veces esta semana");
    }
    return reasons;
  };

  const all: ClosureRow[] = rows.map((row) => ({
    id: row.id,
    category: row.category,
    description: row.description,
    source: row.source,
    status: open(row) || !(CLOSURE_OPEN_STATUSES as readonly string[]).includes(row.status) ? row.status : "expired",
    segments: row.closure_segments.length,
    author: row.reporter?.full_name ?? row.reporter?.email ?? "—",
    reputation: row.source === "community" ? (row.reporter?.reputation ?? 0) : null,
    confirmScore: row.confirm_score,
    denyScore: row.deny_score,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    reasons: reasonsFor(row),
  }));

  const isOpen = (row: ClosureRow) => (CLOSURE_OPEN_STATUSES as readonly string[]).includes(row.status);
  const byTab: Record<Tab, ClosureRow[]> = {
    attention: all.filter((row) => row.reasons.length > 0),
    active: all.filter((row) => row.status === "confirmed"),
    provisional: all.filter((row) => isOpen(row) && row.status !== "confirmed"),
    history: all.filter((row) => !isOpen(row)),
  };

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Inicio" }, { label: "Vías cerradas" }]}
        title="Vías cerradas"
        subtitle="La comunidad confirma los reportes con votos cerca del sitio. Aquí solo llegan las excepciones."
      >
        <Link className={buttonClass("primary", undefined, "lg")} href="/closures/new">
          Cerrar tramos
        </Link>
      </PageHeader>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filtrar cierres">
        {TABS.map((item) => {
          const active = item.id === tab;
          return (
            <Link
              key={item.id}
              href={item.id === "attention" ? "/closures" : `/closures?tab=${item.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm transition-colors",
                active
                  ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-50",
              )}
            >
              {item.label} <span className="opacity-60">{byTab[item.id].length}</span>
            </Link>
          );
        })}
      </nav>

      <QueryError message={error?.message} />
      <div className="mt-4">
        <ClosuresTable key={tab} rows={byTab[tab]} />
      </div>
    </>
  );
}
