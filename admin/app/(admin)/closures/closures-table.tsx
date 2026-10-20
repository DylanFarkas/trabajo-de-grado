"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/catalog/data-table";
import { StatusPill } from "@/components/catalog/status-pill";
import { closureCategoryLabel, closureStatusLabel, closureStatusTone } from "@/lib/catalog";
import { excerpt, formatDateTime } from "@/lib/format";

export type ClosureRow = {
  id: number;
  category: string;
  description: string;
  source: "community" | "admin";
  status: string;
  segments: number;
  author: string;
  reputation: number | null;
  confirmScore: number;
  denyScore: number;
  createdAt: string;
  expiresAt: string;
  /** Por qué está en "Requieren atención". */
  reasons: string[];
};

const columns: ColumnDef<ClosureRow, unknown>[] = [
  {
    accessorKey: "description",
    header: "Cierre",
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">
          #{row.original.id} · {closureCategoryLabel(row.original.category)}
        </span>
        <span className="block max-w-md text-zinc-500 dark:text-zinc-400">{excerpt(row.original.description)}</span>
        {row.original.reasons.length ? (
          <span className="mt-1 text-xs text-amber-700 dark:text-amber-300">{row.original.reasons.join(" · ")}</span>
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: "segments",
    header: "Tramos",
    cell: ({ getValue }) => <span className="text-zinc-500 dark:text-zinc-400">{String(getValue())}</span>,
  },
  {
    accessorKey: "author",
    header: "Origen",
    cell: ({ row }) =>
      row.original.source === "admin" ? (
        <span className="text-zinc-500 dark:text-zinc-400">Universidad</span>
      ) : (
        <span className="flex flex-col text-zinc-500 dark:text-zinc-400">
          <span>{row.original.author}</span>
          {row.original.reputation != null ? (
            <span className={`text-xs ${row.original.reputation < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
              Reputación {row.original.reputation}
            </span>
          ) : null}
        </span>
      ),
  },
  {
    id: "score",
    header: "Votos",
    accessorFn: (row) => row.confirmScore - row.denyScore,
    cell: ({ row }) =>
      row.original.source === "admin" && row.original.denyScore === 0 ? (
        <span className="text-zinc-400">—</span>
      ) : (
        <span className="text-zinc-500 dark:text-zinc-400">
          +{row.original.confirmScore} / −{row.original.denyScore}
        </span>
      ),
  },
  {
    accessorKey: "expiresAt",
    header: "Vence",
    cell: ({ getValue }) => <span className="text-zinc-500 dark:text-zinc-400">{formatDateTime(String(getValue()))}</span>,
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ getValue }) => {
      const status = String(getValue());
      return <StatusPill tone={closureStatusTone(status)}>{closureStatusLabel(status)}</StatusPill>;
    },
  },
];

export function ClosuresTable({ rows }: { rows: ClosureRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowHref={(row) => `/closures/${row.id}`}
      searchPlaceholder="Descripción, motivo o autor"
    />
  );
}
