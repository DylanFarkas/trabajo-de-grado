import Link from "next/link";
import { notFound } from "next/navigation";

import { PlaceForm } from "@/app/(admin)/places/place-form";
import { StatusPill } from "@/components/catalog/status-pill";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/ui/button";
import { contributionStatusLabel, kindLabel } from "@/lib/catalog";
import { excerpt, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function PlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: place }, { data: categories }, { data: assigned }, { data: info }] = await Promise.all([
    supabase.from("places").select("id, name, kind, description").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id, name, tone, active").eq("active", true).order("sort_order"),
    supabase.from("place_categories").select("category_id").eq("place_id", id),
    supabase
      .from("contributions")
      .select("id, body, status, created_at")
      .eq("place_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!place) notFound();
  const selected = new Set((assigned ?? []).map((row) => row.category_id as string));

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/places", label: "Edificios" },
          { label: place.id },
        ]}
        title={place.name}
        subtitle={`${place.id} · ${kindLabel(place.kind)}`}
      />
      <PlaceForm place={place} categories={categories ?? []} selected={selected} />

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-[#ffffff] p-6 dark:border-none dark:bg-[#171717]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Información contextual</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Textos de este espacio: los aportes de usuarios y lo que registres aquí. La app muestra solo lo publicado.
            </p>
          </div>
          <Link
            className={buttonClass("secondary", "shrink-0", "sm")}
            href={`/contributions/new?place=${encodeURIComponent(place.id)}`}
          >
            Agregar
          </Link>
        </div>
        {(info ?? []).length === 0 ? (
          <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">Aún no hay información de este espacio.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {(info ?? []).map((row) => (
              <li key={row.id}>
                <Link
                  className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-zinc-500"
                  href={`/contributions/${row.id}`}
                >
                  <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-50">{excerpt(row.body)}</span>
                  <span className="flex shrink-0 items-center gap-3 text-zinc-400">
                    {formatDate(row.created_at)}
                    <StatusPill tone={row.status === "approved" ? "ok" : row.status === "rejected" ? "danger" : "warn"}>
                      {contributionStatusLabel(row.status)}
                    </StatusPill>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
