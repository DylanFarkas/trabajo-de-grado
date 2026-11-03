"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/catalog/data-table";
import { StatusPill } from "@/components/catalog/status-pill";

export type SpaceRow = {
  id: string;
  name: string;
  official: boolean;
};

const columns: ColumnDef<SpaceRow, unknown>[] = [
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
    accessorKey: "official",
    header: "Reconocimiento",
    cell: ({ getValue }) =>
      getValue() ? <StatusPill tone="ok">Oficial</StatusPill> : <StatusPill tone="muted">No oficial</StatusPill>,
  },
];

export function EspaciosTable({ spaces }: { spaces: SpaceRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={spaces}
      getRowHref={(space) => `/espacios/${space.id}`}
      searchPlaceholder="Código o nombre"
    />
  );
}
