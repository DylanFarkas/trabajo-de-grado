"use client";

import Link from "next/link";
import { useActionState, useCallback, useState } from "react";

import { createAdminClosure, type ClosureFormState } from "@/app/actions";
import { ClosureMap, type BusySegment, type SegmentProps } from "@/app/(admin)/closures/closure-map";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/input";
import {
  CLOSURE_CATEGORIES,
  CLOSURE_CATEGORY_LABELS,
  CLOSURE_DESCRIPTION_MAX,
  CLOSURE_DESCRIPTION_MIN,
  CLOSURE_DURATIONS,
  CLOSURE_MAX_SEGMENTS,
} from "@/lib/catalog";

const cardClass = "grid gap-4 rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]";
const initialState: ClosureFormState = { error: null };

function segmentLabel(segment: SegmentProps | undefined, key: string) {
  if (!segment) return key;
  const kind = segment.kind === "pasillo" ? "Pasillo" : segment.vehicle ? "Vía" : "Sendero";
  const length = segment.lengthM ? ` · ${Math.round(segment.lengthM)} m` : "";
  return `${segment.name ?? kind}${length}`;
}

export function ClosureCreateForm({ busy }: { busy: BusySegment[] }) {
  const [state, formAction, pending] = useActionState(createAdminClosure, initialState);
  const [selected, setSelected] = useState<string[]>([]);
  const [segments, setSegments] = useState<Map<string, SegmentProps>>(new Map());
  const [busyId, setBusyId] = useState<number | null>(null);

  const toggle = useCallback((segment: SegmentProps) => {
    setBusyId(null);
    setSelected((current) => {
      if (current.includes(segment.key)) return current.filter((key) => key !== segment.key);
      if (current.length >= CLOSURE_MAX_SEGMENTS) return current;
      return [...current, segment.key];
    });
  }, []);

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="grid gap-3">
        <ClosureMap
          selected={selected}
          onToggle={toggle}
          onBusyClick={setBusyId}
          busy={busy}
          onSegmentsLoaded={setSegments}
          className="h-136"
        />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Haz clic en los tramos para elegirlos; otro clic los quita. Gris: senderos, oscuro: vías, morado:
          pasillos. Los tramos punteados ya tienen un cierre abierto.
        </p>
        {busyId != null ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Ese tramo ya está en el cierre #{busyId}.{" "}
            <Link className="underline" href={`/closures/${busyId}`}>
              Abrirlo
            </Link>
          </p>
        ) : null}
      </div>

      <form action={formAction} className={cardClass}>
        <h2 className="text-lg font-semibold tracking-tight">Nuevo cierre</h2>
        <input type="hidden" name="segment_keys" value={JSON.stringify(selected)} />

        <div className="grid gap-2 text-sm">
          <span className="font-medium">
            {selected.length === 0
              ? "Ningún tramo elegido"
              : selected.length === 1
                ? "1 tramo"
                : `${selected.length} tramos`}
          </span>
          {selected.length > 0 ? (
            <ul className="grid max-h-40 gap-1 overflow-y-auto text-zinc-600 dark:text-zinc-300">
              {selected.map((key) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{segmentLabel(segments.get(key), key)}</span>
                  <button
                    type="button"
                    className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => setSelected((current) => current.filter((item) => item !== key))}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Field>
          Motivo
          <Select name="category" defaultValue="obra">
            {CLOSURE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CLOSURE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          Duración
          <Select name="duration_hours" defaultValue="24">
            {CLOSURE_DURATIONS.map((option) => (
              <option key={option.hours} value={option.hours}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          Descripción para la app
          <Textarea
            name="description"
            required
            minLength={CLOSURE_DESCRIPTION_MIN}
            maxLength={CLOSURE_DESCRIPTION_MAX}
            className="min-h-24 dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]"
            placeholder="Ej.: obra de mantenimiento del sendero entre E19 y la biblioteca."
          />
        </Field>

        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          El cierre queda activo de inmediato para todos y las rutas lo evitan. Vence solo al terminar la duración.
        </p>

        {state.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {state.error}
            {state.existingId ? (
              <>
                {" "}
                <Link className="underline" href={`/closures/${state.existingId}`}>
                  Ver cierre #{state.existingId}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <Button className="cursor-pointer" size="lg" type="submit" disabled={pending || selected.length === 0}>
          {pending ? "Creando…" : "Cerrar tramos"}
        </Button>
      </form>
    </div>
  );
}
