"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/catalog/data-table";
import { StatusPill } from "@/components/catalog/status-pill";
import { contributionStatusLabel } from "@/lib/catalog";
import { excerpt, formatDate } from "@/lib/format";

export type ContributionRow = {
  id: number;
  placeId: string;
  placeName: string;
  body: string;
  author: string;
  status: string;
  createdAt: string;
};

const columns: ColumnDef<ContributionRow, unknown>[] = [
  {
    accessorKey: "placeName",
    header: "Espacio",
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{row.original.placeName}</span>
        <span className="text-xs text-zinc-400">{row.original.placeId}</span>
      </span>
    ),
  },
  {
    accessorKey: "body",
    header: "Texto",
    cell: ({ getValue }) => (
      <span className="block max-w-md text-zinc-700 dark:text-zinc-300">{excerpt(String(getValue()))}</span>
    ),
  },
  {
    accessorKey: "author",
    header: "Autor",
    cell: ({ getValue }) => <span className="text-zinc-500 dark:text-zinc-400">{String(getValue())}</span>,
  },
  {
    accessorKey: "createdAt",
    header: "Fecha",
    cell: ({ getValue }) => <span className="text-zinc-500 dark:text-zinc-400">{formatDate(String(getValue()))}</span>,
  },
  {
    accessorKey: "status",
    header: "Estado",
    filterFn: "equals",
    cell: ({ getValue }) => {
      const status = String(getValue());
      return (
        <StatusPill tone={status === "approved" ? "ok" : status === "rejected" ? "danger" : "warn"}>
          {contributionStatusLabel(status)}
        </StatusPill>
      );
    },
  },
];

export function ContributionsTable({ rows }: { rows: ContributionRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      filterTabs={{
        columnId: "status",
        allLabel: "Todas",
        initial: "pending",
        options: [
          { label: "Pendientes", value: "pending" },
          { label: "Publicadas", value: "approved" },
          { label: "Rechazadas", value: "rejected" },
        ],
      }}
      getRowHref={(row) => `/contributions/${row.id}`}
      searchPlaceholder="Espacio, texto o autor"
    />
  );
}
