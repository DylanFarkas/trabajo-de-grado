import Link from "next/link";

import { saveContribution } from "@/app/actions";
import { Button, buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/input";
import { CONTRIBUTION_BODY_MAX } from "@/lib/catalog";

const cardClass = "grid gap-4 rounded-2xl bg-[#ffffff] border border-zinc-200 dark:border-none p-6 dark:bg-[#171717]";
const fieldClass = "dark:bg-[#262626] border border-zinc-100 dark:border-[#141212]";

export function ContributionForm({
  contribution,
  places,
  defaultPlaceId,
}: {
  contribution?: { id: number; place_id: string; body: string };
  places?: { id: string; name: string }[];
  defaultPlaceId?: string;
}) {
  const editing = contribution != null;

  return (
    <form action={saveContribution} className={cardClass}>
      <h2 className="text-lg font-semibold tracking-tight">{editing ? "Contenido" : "Nueva información"}</h2>
      {editing ? <input type="hidden" name="id" value={contribution.id} /> : null}

      {editing ? null : (
        <Field>
          Espacio
          <Select name="place_id" className={fieldClass} defaultValue={defaultPlaceId ?? ""} required>
            <option value="" disabled>
              Elige un edificio o espacio
            </option>
            {(places ?? []).map((place) => (
              <option key={place.id} value={place.id}>
                {place.id} · {place.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field>
        Texto
        <Textarea
          name="body"
          className={`${fieldClass} min-h-40`}
          defaultValue={contribution?.body ?? ""}
          maxLength={CONTRIBUTION_BODY_MAX}
          placeholder="Horarios, servicios, cómo entrar, consejos…"
          required
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Hasta {CONTRIBUTION_BODY_MAX} caracteres.
          {editing ? "" : " Lo que registres aquí se publica de inmediato."}
        </span>
      </Field>
      <div className="mt-2 flex items-center gap-3">
        <Button size="lg" type="submit" className="cursor-pointer">
          {editing ? "Guardar cambios" : "Publicar"}
        </Button>
        <Link className={buttonClass("secondary", undefined, "lg")} href="/contributions">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
