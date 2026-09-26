import Link from "next/link";

import { CategoriesTable } from "@/app/(admin)/categories/categories-table";
import { QueryError } from "@/components/catalog/query-error";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name, tone, sort_order, active")
    .order("sort_order")
    .order("name");

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Inicio" }, { label: "Categorías" }]}
        title="Categorías"
        subtitle="El orden de las filas es el que ve la app. Usa las flechas para mover."
      >
        <Link className={buttonClass("primary")} href="/categories/new">
          Nueva categoría
        </Link>
      </PageHeader>
      <QueryError message={error?.message} />
      <CategoriesTable categories={categories ?? []} />
    </>
  );
}
