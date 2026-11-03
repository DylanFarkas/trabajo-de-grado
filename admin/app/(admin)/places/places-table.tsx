"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/catalog/data-table";
import { StatusPill } from "@/components/catalog/status-pill";
import { kindLabel } from "@/lib/catalog";

export type PlaceRow = {
  id: string;
  name: string;
  kind: string;
  official: boolean;
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
  {
    accessorKey: "official",
    header: "Reconocimiento",
    cell: ({ getValue }) =>
      getValue() ? <StatusPill tone="ok">Oficial</StatusPill> : <StatusPill tone="muted">No oficial</StatusPill>,
  },
];

export function PlacesTable({ places }: { places: PlaceRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={places}
      getRowHref={(place) => `/places/${place.id}`}
      searchPlaceholder="Código o nombre"
    />
  );
}
