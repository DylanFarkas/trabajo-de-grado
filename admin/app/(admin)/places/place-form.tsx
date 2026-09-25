import { updatePlace } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { KIND_LABELS, KINDS, toneLabel } from "@/lib/catalog";

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
    <form action={updatePlace} className="mt-6 grid max-w-xl gap-4">
      <input type="hidden" name="id" value={place.id} />
      <Field>
        Nombre
        <Input name="name" defaultValue={place.name} required />
      </Field>
      <Field>
        Descripción
        <Textarea name="description" defaultValue={place.description ?? ""} />
      </Field>
      <Field>
        Tipo
        <Select name="kind" defaultValue={place.kind}>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Categorías</legend>
        {categories.map((category) => (
          <label key={category.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="category_id" value={category.id} defaultChecked={selected.has(category.id)} />
            <span>{category.name}</span>
            <span className="text-zinc-500 dark:text-zinc-400">{toneLabel(category.tone)}</span>
          </label>
        ))}
      </fieldset>
      <Button className="w-fit" size="lg" type="submit">
        Guardar ficha
      </Button>
    </form>
  );
}
