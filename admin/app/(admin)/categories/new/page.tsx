import { CategoryForm } from "@/app/(admin)/categories/category-form";
import { PageHeader } from "@/components/layout/page-header";

export default function NewCategoryPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/", label: "Inicio" },
          { href: "/categories", label: "Categorías" },
          { label: "Nueva" },
        ]}
        title="Nueva categoría"
        subtitle="El id va en minúsculas y no se puede cambiar después."
      />
      <CategoryForm />
    </>
  );
}
