"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/catalog/data-table";
import { StatusPill } from "@/components/catalog/status-pill";

export type RouteRow = {
  id: number;
  name: string;
  published: boolean;
  stops: number;
};

const columns: ColumnDef<RouteRow, unknown>[] = [
  {
    accessorKey: "name",
    header: "Nombre",
    cell: ({ getValue }) => <span className="font-medium text-zinc-900 dark:text-zinc-50">{String(getValue())}</span>,
  },
  {
    accessorKey: "stops",
    header: "Sitios",
    cell: ({ getValue }) => {
      const stops = Number(getValue());
      return (
        <span className="text-zinc-500 dark:text-zinc-400">
          {stops} {stops === 1 ? "sitio" : "sitios"}
        </span>
      );
    },
  },
  {
    accessorKey: "published",
    header: "Estado",
    filterFn: "equals",
    accessorFn: (row) => (row.published ? "published" : "draft"),
    cell: ({ row }) =>
      row.original.published ? (
        <StatusPill tone="ok">Publicada</StatusPill>
      ) : (
        <StatusPill tone="muted">Borrador</StatusPill>
      ),
  },
];

export function RoutesTable({ routes }: { routes: RouteRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={routes}
      filterTabs={{
        columnId: "published",
        allLabel: "Todas",
        options: [
          { label: "Publicadas", value: "published" },
          { label: "Borradores", value: "draft" },
        ],
      }}
      getRowHref={(route) => `/routes/${route.id}`}
      searchPlaceholder="Nombre de la ruta"
    />
  );
}
