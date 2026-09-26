"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const EMPTY: never[] = [];

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Buscar",
  pageSize = 8,
  getRowHref,
  filterTabs,
  sortable = true,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  searchPlaceholder?: string;
  pageSize?: number;
  getRowHref?: (row: T) => string;
  sortable?: boolean;
  filterTabs?: {
    columnId: string;
    allLabel: string;
    options: { label: string; value: string }[];
  };
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [tab, setTab] = useState("all");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data: data.length > 0 ? data : (EMPTY as T[]),
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableSorting: sortable,
    initialState: { pagination: { pageSize } },
  });

  function selectTab(value: string) {
    setTab(value);
    if (!filterTabs) return;
    table.setPageIndex(0);
    if (value === "all") {
      setColumnFilters((current) => current.filter((filter) => filter.id !== filterTabs.columnId));
      return;
    }
    setColumnFilters((current) => [
      ...current.filter((filter) => filter.id !== filterTabs.columnId),
      { id: filterTabs.columnId, value },
    ]);
  }

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const size = table.getState().pagination.pageSize;
  const from = filteredCount === 0 ? 0 : pageIndex * size + 1;
  const to = Math.min(filteredCount, (pageIndex + 1) * size);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        {filterTabs ? (
          <div className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800">
            <FilterTab active={tab === "all"} onClick={() => selectTab("all")}>
              {filterTabs.allLabel}
            </FilterTab>
            {filterTabs.options.map((option) => (
              <FilterTab key={option.value} active={tab === option.value} onClick={() => selectTab(option.value)}>
                {option.label}
              </FilterTab>
            ))}
          </div>
        ) : (
          <div />
        )}
        <Input
          className="max-w-xs dark:border-[#141212] dark:bg-[#262626]"
          value={globalFilter}
          onChange={(event) => {
            setGlobalFilter(event.target.value);
            table.setPageIndex(0);
          }}
          placeholder={searchPlaceholder}
        />
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-xl text-left">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-zinc-200 dark:border-zinc-800">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-3 text-xs font-medium uppercase tracking-wide text-zinc-400 first:pl-0 last:pr-0"
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          className="inline-flex items-center gap-1 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp size={12} />
                          ) : sorted === "desc" ? (
                            <ArrowDown size={12} />
                          ) : (
                            <ArrowUpDown size={12} className="opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400" colSpan={columns.length}>
                  No hay resultados.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const href = getRowHref?.(row.original);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-zinc-100 last:border-0 dark:border-zinc-800/70",
                      href && "cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60",
                    )}
                    onClick={href ? () => router.push(href) : undefined}
                    onKeyDown={
                      href
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(href);
                            }
                          }
                        : undefined
                    }
                    role={href ? "link" : undefined}
                    tabIndex={href ? 0 : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-3.5 text-sm first:pl-0 last:pr-0">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400">
        <p>
          {filteredCount === 0 ? "0 resultados" : `${from}–${to} de ${filteredCount}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            className="inline-flex items-center gap-1 disabled:opacity-40"
            disabled={!table.getCanPreviousPage()}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => table.previousPage()}
          >
            <ChevronLeft size={14} />
            Anterior
          </Button>
          <Button
            className="inline-flex items-center gap-1 disabled:opacity-40"
            disabled={!table.getCanNextPage()}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => table.nextPage()}
          >
            Siguiente
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-50 "
          : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
