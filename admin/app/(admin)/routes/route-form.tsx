"use client";

import { Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { deleteRoute, saveRoute } from "@/app/actions";
import { Button, buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { KIND_LABELS, KINDS, kindLabel } from "@/lib/catalog";
import { cn } from "@/lib/cn";

const cardClass = "rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]";
const fieldClass = "dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]";

export type RoutePlace = {
  id: string;
  name: string;
  kind: string;
};

export function RouteForm({
  routeId,
  name,
  description,
  published,
  stopIds,
  places,
}: {
  routeId?: number;
  name: string;
  description: string;
  published: boolean;
  stopIds: string[];
  places: RoutePlace[];
}) {
  const [selected, setSelected] = useState(stopIds);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | (typeof KINDS)[number]>("all");
  const byId = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const needle = query.trim().toLowerCase();
  const available = places.filter((place) => {
    if (selected.includes(place.id)) return false;
    if (kind !== "all" && place.kind !== kind) return false;
    if (!needle) return true;
    return place.name.toLowerCase().includes(needle) || place.id.toLowerCase().includes(needle);
  });

  function addPlace(placeId: string) {
    setSelected((current) => (current.includes(placeId) ? current : [...current, placeId]));
  }

  function removePlace(placeId: string) {
    setSelected((current) => current.filter((id) => id !== placeId));
  }

  return (
    <form action={saveRoute} className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {routeId != null ? <input type="hidden" name="id" value={routeId} /> : null}
      {selected.map((placeId) => (
        <input key={placeId} type="hidden" name="place_id" value={placeId} />
      ))}

      <section className={cn("grid gap-4", cardClass)}>
        <h2 className="text-lg font-semibold tracking-tight">Ficha</h2>
        <Field>
          Nombre
          <Input name="name" className={fieldClass} defaultValue={name} required />
        </Field>
        <Field>
          Descripción
          <Textarea name="description" className={fieldClass} defaultValue={description} />
        </Field>
        <label className="flex items-start gap-3 rounded-xl bg-zinc-50 px-3 py-3 text-sm dark:bg-[#262626]">
          <input className="mt-0.5" type="checkbox" name="published" defaultChecked={published} />
          <span>
            <span className="font-medium">Publicada</span>
            <span className="mt-0.5 block text-zinc-500 dark:text-zinc-400">
              La app solo muestra rutas publicadas, y hacen falta al menos dos sitios.
            </span>
          </span>
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button size="lg" type="submit" className="cursor-pointer">
            Guardar
          </Button>
          <Link className={buttonClass("secondary", undefined, "lg")} href="/routes">
            Cancelar
          </Link>
          {routeId != null ? (
            <Button variant="danger" formAction={deleteRoute} type="submit">
              Borrar ruta
            </Button>
          ) : null}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Sitios</h2>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            {selected.length === 0
              ? "Ninguno todavía"
              : `${selected.length} sitio${selected.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          La app los recorre desde el origen, en el orden que menos camino implique.
        </p>

        {selected.length === 0 ? (
          <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
            Toca un edificio o espacio de abajo para armar la ruta.
          </p>
        ) : (
          <ol className="mt-5 grid gap-2">
            {selected.map((placeId, index) => {
              const place = byId.get(placeId);
              const role =
                selected.length > 1 && index === 0
                  ? "Origen"
                  : selected.length > 1 && index === selected.length - 1
                    ? "Destino"
                    : null;
              return (
                <li
                  key={placeId}
                  className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-[#262626]"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 dark:bg-[#171717] dark:text-zinc-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{place?.name ?? placeId}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {role ? `${role} · ` : ""}
                      {placeId}
                      {place ? ` · ${kindLabel(place.kind)}` : ""}
                    </p>
                  </div>
                  <button
                    aria-label={`Quitar ${place?.name ?? placeId}`}
                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-[#171717] dark:hover:text-zinc-100"
                    type="button"
                    onClick={() => removePlace(placeId)}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div className="relative mt-6">
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" size={14} />
          <Input
            aria-label="Buscar edificio o espacio"
            className={cn("w-full pl-8", fieldClass)}
            placeholder="Buscar código o nombre"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800">
          <KindTab active={kind === "all"} onClick={() => setKind("all")}>
            Todos
          </KindTab>
          {KINDS.map((item) => (
            <KindTab key={item} active={kind === item} onClick={() => setKind(item)}>
              {KIND_LABELS[item]}
            </KindTab>
          ))}
        </div>

        {available.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No hay sitios con ese filtro.</p>
        ) : (
          <ul className="mt-4 max-h-80 overflow-y-auto">
            {available.slice(0, 30).map((place) => (
              <li key={place.id}>
                <button
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-[#262626]"
                  type="button"
                  onClick={() => addPlace(place.id)}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-[#262626] dark:text-zinc-400">
                    <Plus size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{place.name}</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {place.id} · {kindLabel(place.kind)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </form>
  );
}

function KindTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-50"
          : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
