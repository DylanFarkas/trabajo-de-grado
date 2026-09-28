"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/catalog/data-table";
import { StatusPill } from "@/components/catalog/status-pill";

export type RouteRow = {
  id: number;
  name: string;
  imageUrl: string | null;
  published: boolean;
  stops: number;
};

const columns: ColumnDef<RouteRow, unknown>[] = [
  {
    accessorKey: "name",
    header: "Nombre",
    cell: ({ row }) => (
      <span className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
          {row.original.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="size-full object-contain" src={row.original.imageUrl} />
          ) : (
            <span className="text-[10px] font-medium text-zinc-400">—</span>
          )}
        </span>
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{row.original.name}</span>
      </span>
    ),
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
