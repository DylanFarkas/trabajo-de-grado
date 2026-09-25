"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo } from "react";

import { moveCategory } from "@/app/actions";
import { DataTable } from "@/components/catalog/data-table";
import { StatusPill } from "@/components/catalog/status-pill";
import { toneLabel } from "@/lib/catalog";

export type CategoryRow = {
  id: string;
  name: string;
  tone: string;
  sort_order: number;
  active: boolean;
};

export function CategoriesTable({ categories }: { categories: CategoryRow[] }) {
  const columns = useMemo<ColumnDef<CategoryRow, unknown>[]>(
    () => [
      {
        id: "move",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const index = categories.findIndex((category) => category.id === row.original.id);
          return (
            <div className="flex items-center gap-0.5" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              <form action={moveCategory}>
                <input type="hidden" name="id" value={row.original.id} />
                <input type="hidden" name="direction" value="up" />
                <button
                  aria-label="Subir"
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  disabled={index <= 0}
                  type="submit"
                >
                  <ChevronUp size={16} />
                </button>
              </form>
              <form action={moveCategory}>
                <input type="hidden" name="id" value={row.original.id} />
                <input type="hidden" name="direction" value="down" />
                <button
                  aria-label="Bajar"
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  disabled={index < 0 || index >= categories.length - 1}
                  type="submit"
                >
                  <ChevronDown size={16} />
                </button>
              </form>
            </div>
          );
        },
      },
      {
        accessorKey: "id",
        header: "Código",
        cell: ({ getValue }) => <span className="text-zinc-500 dark:text-zinc-400">{String(getValue())}</span>,
      },
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ getValue }) => <span className="font-medium text-zinc-900 dark:text-zinc-50">{String(getValue())}</span>,
      },
      {
        accessorKey: "tone",
        header: "Tono",
        filterFn: "equals",
        cell: ({ getValue }) => toneLabel(String(getValue())),
      },
      {
        accessorKey: "active",
        header: "Estado",
        filterFn: "equals",
        accessorFn: (row) => (row.active ? "active" : "inactive"),
        cell: ({ row }) =>
          row.original.active ? <StatusPill tone="ok">Activa</StatusPill> : <StatusPill tone="muted">Inactiva</StatusPill>,
      },
    ],
    [categories],
  );

  return (
    <DataTable
      columns={columns}
      data={categories}
      filterTabs={{
        columnId: "active",
        allLabel: "Todas",
        options: [
          { label: "Activas", value: "active" },
          { label: "Inactivas", value: "inactive" },
        ],
      }}
      getRowHref={(category) => `/categories/${category.id}`}
      searchPlaceholder="Código o nombre"
      sortable={false}
    />
  );
}
