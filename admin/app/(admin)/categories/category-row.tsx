import { deleteCategory, updateCategory } from "@/app/actions";
import { ToneSelect } from "@/components/catalog/tone-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function CategoryRow({
  category,
}: {
  category: {
    id: string;
    name: string;
    description: string | null;
    tone: string;
    sort_order: number;
    active: boolean;
  };
}) {
  return (
    <li>
      <Card>
        <form action={updateCategory} className="grid gap-3 md:grid-cols-6">
          <input type="hidden" name="id" value={category.id} />
          <p className="self-center text-sm text-zinc-500 dark:text-zinc-400">{category.id}</p>
          <Input className="md:col-span-2" name="name" defaultValue={category.name} required />
          <ToneSelect value={category.tone} />
          <Input name="sort_order" type="number" defaultValue={category.sort_order} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={category.active} />
            Activa
          </label>
          <Input className="md:col-span-5" name="description" defaultValue={category.description ?? ""} />
          <Button variant="secondary" type="submit">
            Guardar
          </Button>
        </form>
        <form action={deleteCategory} className="mt-2">
          <input type="hidden" name="id" value={category.id} />
          <Button variant="danger" type="submit">
            Borrar
          </Button>
        </form>
      </Card>
    </li>
  );
}
