import { CategoryCreateForm } from "@/app/(admin)/categories/category-create-form";
import { CategoryRow } from "@/app/(admin)/categories/category-row";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name, description, tone, sort_order, active")
    .order("sort_order");

  return (
    <>
      <PageHeader title="Categorías" />
      <QueryError message={error?.message} />
      <CategoryCreateForm />
      <ul className="mt-6 grid gap-3">
        {(categories ?? []).map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </ul>
    </>
  );
}
