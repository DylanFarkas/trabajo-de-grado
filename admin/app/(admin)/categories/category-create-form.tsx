import { createCategory } from "@/app/actions";
import { ToneSelect } from "@/components/catalog/tone-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function CategoryCreateForm() {
  return (
    <form action={createCategory} className="mt-6">
      <Card className="grid gap-3 md:grid-cols-6">
        <Input name="id" placeholder="id, ej. cafeteria" required />
        <Input className="md:col-span-2" name="name" placeholder="Nombre" required />
        <ToneSelect />
        <Input name="sort_order" type="number" defaultValue={40} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked />
          Activa
        </label>
        <Input className="md:col-span-5" name="description" placeholder="Descripción" />
        <Button type="submit">Crear</Button>
      </Card>
    </form>
  );
}
