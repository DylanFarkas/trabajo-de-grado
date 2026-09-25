"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { deleteRoute, saveRoute } from "@/app/actions";

export type RoutePlace = {
  id: string;
  name: string;
  kind: string;
};

const KIND_LABEL: Record<string, string> = {
  building: "Edificio",
  space: "Espacio",
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
  const byId = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const needle = query.trim().toLowerCase();
  const available = places.filter((place) => {
    if (selected.includes(place.id)) return false;
    if (!needle) return true;
    return place.name.toLowerCase().includes(needle) || place.id.toLowerCase().includes(needle);
  });

  return (
    <form action={saveRoute} className="mt-6 grid gap-6">
      {routeId != null ? <input type="hidden" name="id" value={routeId} /> : null}
      {selected.map((placeId) => (
        <input key={placeId} type="hidden" name="place_id" value={placeId} />
      ))}

      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <label className="grid gap-1 text-sm">
          Nombre
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2"
            name="name"
            defaultValue={name}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Descripción
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2"
            name="description"
            defaultValue={description}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={published} />
          Publicada. La app solo muestra rutas publicadas, y hacen falta al menos dos sitios.
        </label>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Sitios de la ruta</h2>
        <p className="mt-1 text-sm text-zinc-600">
          La app los recorre desde el origen, en el orden que menos camino implique.
        </p>
        {selected.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Todavía no hay sitios.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {selected.map((placeId) => {
              const place = byId.get(placeId);
              return (
                <li key={placeId} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{place?.name ?? placeId}</p>
                    <p className="text-xs text-zinc-500">
                      {placeId}
                      {place ? ` · ${KIND_LABEL[place.kind] ?? place.kind}` : ""}
                    </p>
                  </div>
                  <button
                    className="rounded-full border border-zinc-300 px-3 py-1 text-sm text-red-700"
                    type="button"
                    onClick={() => setSelected(selected.filter((id) => id !== placeId))}
                  >
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Agregar edificio o espacio</h2>
        <input
          className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder="Código o nombre"
        />
        <ul className="mt-3 max-h-72 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200">
          {available.slice(0, 30).map((place) => (
            <li key={place.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{place.name}</p>
                <p className="text-xs text-zinc-500">
                  {place.id} · {KIND_LABEL[place.kind] ?? place.kind}
                </p>
              </div>
              <button
                className="rounded-full border border-zinc-300 px-3 py-1 text-sm"
                type="button"
                onClick={() => setSelected([...selected, place.id])}
              >
                Agregar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center gap-4">
        <button className="rounded-full bg-zinc-950 px-4 py-2 text-sm text-white" type="submit">
          Guardar
        </button>
        <Link className="rounded-full border border-zinc-300 px-4 py-2 text-sm" href="/routes">
          Cancelar
        </Link>
        {routeId != null ? (
          <button className="text-sm text-red-700" formAction={deleteRoute} type="submit">
            Borrar ruta
          </button>
        ) : null}
      </div>
    </form>
  );
}
