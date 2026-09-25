"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { deleteRoute, saveRoute } from "@/app/actions";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { kindLabel } from "@/lib/catalog";

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

      <Card className="grid gap-3">
        <Field>
          Nombre
          <Input name="name" defaultValue={name} required />
        </Field>
        <Field>
          Descripción
          <Input name="description" defaultValue={description} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={published} />
          Publicada. La app solo muestra rutas publicadas, y hacen falta al menos dos sitios.
        </label>
      </Card>

      <Card>
        <h2 className="font-semibold">Sitios de la ruta</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          La app los recorre desde el origen, en el orden que menos camino implique.
        </p>
        {selected.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Todavía no hay sitios.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {selected.map((placeId) => {
              const place = byId.get(placeId);
              return (
                <li key={placeId} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                  <div>
                    <p className="text-sm font-medium">{place?.name ?? placeId}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {placeId}
                      {place ? ` · ${kindLabel(place.kind)}` : ""}
                    </p>
                  </div>
                  <Button
                    className="rounded-full border border-zinc-300 px-3 py-1 dark:border-zinc-600"
                    variant="danger"
                    type="button"
                    onClick={() => setSelected(selected.filter((id) => id !== placeId))}
                  >
                    Quitar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Agregar edificio o espacio</h2>
        <Input
          className="mt-3 w-full dark:bg-zinc-950"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder="Código o nombre"
        />
        <ul className="mt-3 max-h-72 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
          {available.slice(0, 30).map((place) => (
            <li key={place.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{place.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {place.id} · {kindLabel(place.kind)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setSelected([...selected, place.id])}
              >
                Agregar
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit">Guardar</Button>
        <Link className={buttonClass("secondary")} href="/routes">
          Cancelar
        </Link>
        {routeId != null ? (
          <Button variant="danger" formAction={deleteRoute} type="submit">
            Borrar ruta
          </Button>
        ) : null}
      </div>
    </form>
  );
}
