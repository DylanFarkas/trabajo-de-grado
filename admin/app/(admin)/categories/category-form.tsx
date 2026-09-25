import Link from "next/link";

import { createCategory, deleteCategory, updateCategory } from "@/app/actions";
import { ToneSelect } from "@/components/catalog/tone-select";
import { Button, buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { kindLabel } from "@/lib/catalog";

export function CategoryForm({
  category,
  places = [],
}: {
  category?: {
    id: string;
    name: string;
    description: string | null;
    tone: string;
    active: boolean;
  };
  places?: { id: string; name: string; kind: string }[];
}) {
  const editing = category != null;

  return (
    <form
      action={editing ? updateCategory : createCategory}
      className={editing ? "mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]" : "mt-8 max-w-xl"}
    >
      {editing ? <input type="hidden" name="id" value={category.id} /> : null}

      <section className="grid gap-4 rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]">
        <h2 className="text-lg font-semibold tracking-tight">Ficha</h2>
        {editing ? null : (
          <Field>
            Id
            <Input name="id" className="dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]" placeholder="ej. cafeteria" required />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Minúsculas, sin espacios. Después no se cambia.</span>
          </Field>
        )}
        <Field>
          Nombre
          <Input name="name" className="dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]" defaultValue={category?.name ?? ""} required />
        </Field>
        <Field>
          Tono
          <ToneSelect value={category?.tone} />
        </Field>
        <Field>
          Descripción
          <Textarea name="description" className="dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]" defaultValue={category?.description ?? ""} />
        </Field>
        <label className="flex items-start gap-3 rounded-xl bg-zinc-50 px-3 py-3 text-sm dark:bg-[#262626]">
          <input className="mt-0.5" type="checkbox" name="active" defaultChecked={category?.active ?? true} />
          <span>
            <span className="font-medium">Activa</span>
            <span className="mt-0.5 block text-zinc-500 dark:text-zinc-400">La app solo muestra categorías activas.</span>
          </span>
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button size="lg" type="submit" className="cursor-pointer">
            {editing ? "Guardar" : "Crear categoría"}
          </Button>
          <Link className={buttonClass("secondary", undefined, "lg")} href="/categories">
            Cancelar
          </Link>
          {editing ? (
            <Button variant="danger" formAction={deleteCategory} type="submit">
              Borrar
            </Button>
          ) : null}
        </div>
      </section>

      {editing ? (
        <section className="rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]">
          <h2 className="text-lg font-semibold tracking-tight">Edificios</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {places.length === 0
              ? "Ningún edificio o espacio usa esta categoría."
              : `${places.length} con esta categoría. Se asigna desde la ficha de cada uno.`}
          </p>
          {places.length > 0 ? (
            <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
              {places.map((place) => (
                <li key={place.id}>
                  <Link
                    className="flex items-baseline justify-between gap-3 py-3 text-sm transition-colors hover:text-zinc-500"
                    href={`/places/${place.id}`}
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{place.name}</span>
                    <span className="shrink-0 text-zinc-400">
                      {place.id} · {kindLabel(place.kind)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}
