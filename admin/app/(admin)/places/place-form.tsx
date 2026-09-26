import Link from "next/link";

import { updatePlace } from "@/app/actions";
import { CategoryPicker } from "@/components/catalog/category-picker";
import { Button, buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { KIND_LABELS, KINDS } from "@/lib/catalog";

export function PlaceForm({
  place,
  categories,
  selected,
}: {
  place: { id: string; name: string; kind: string; description: string | null };
  categories: { id: string; name: string; tone: string }[];
  selected: Set<string>;
}) {
  return (
    <form action={updatePlace} className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <input type="hidden" name="id" value={place.id} />

      <section className="grid gap-4 rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]">
        <h2 className="text-lg font-semibold tracking-tight">Ficha</h2>
        <Field>
          Nombre
          <Input name="name" className="dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]" defaultValue={place.name} required />
        </Field>
        <Field>
          Tipo
          <Select name="kind" className="dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]" defaultValue={place.kind}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          Descripción
          <Textarea name="description" className="dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]" defaultValue={place.description ?? ""} />
        </Field>
        <div className="mt-2 flex items-center gap-3">
          <Button size="lg" type="submit" className="cursor-pointer">
            Guardar ficha
          </Button>
          <Link className={buttonClass("secondary", undefined, "lg")} href="/places">
            Cancelar
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]">
        <h2 className="text-lg font-semibold tracking-tight">Categorías</h2>
        <p className="mt-1 mb-5 text-sm text-zinc-500 dark:text-zinc-400">
          Busca por nombre o filtra por tono.
        </p>
        <CategoryPicker categories={categories} selectedIds={[...selected]} />
      </section>
    </form>
  );
}
