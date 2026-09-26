"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/catalog/data-table";
import { kindLabel } from "@/lib/catalog";

export type PlaceRow = {
  id: string;
  name: string;
  kind: string;
};

const columns: ColumnDef<PlaceRow, unknown>[] = [
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
    accessorKey: "kind",
    header: "Tipo",
    filterFn: "equals",
    cell: ({ getValue }) => kindLabel(String(getValue())),
  },
];

export function PlacesTable({ places }: { places: PlaceRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={places}
      filterTabs={{
        columnId: "kind",
        allLabel: "Todos",
        options: [
          { label: "Edificios", value: "building" },
          { label: "Espacios", value: "space" },
        ],
      }}
      getRowHref={(place) => `/places/${place.id}`}
      searchPlaceholder="Código o nombre"
    />
  );
}
