"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { TONES, toneLabel, type Tone } from "@/lib/catalog";
import { cn } from "@/lib/cn";

type Category = { id: string; name: string; tone: string };

export function CategoryPicker({
  categories,
  selectedIds,
}: {
  categories: Category[];
  selectedIds: string[];
}) {
  const [picked, setPicked] = useState(() => new Set(selectedIds));
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<Tone | "all">("all");

  const needle = query.trim().toLowerCase();
  const tones = useMemo(() => TONES.filter((item) => categories.some((category) => category.tone === item)), [categories]);

  const selected = categories.filter((category) => picked.has(category.id));
  const available = categories.filter((category) => {
    if (picked.has(category.id)) return false;
    if (tone !== "all" && category.tone !== tone) return false;
    if (!needle) return true;
    return category.name.toLowerCase().includes(needle);
  });
  const groups = tones
    .map((item) => ({ tone: item, items: available.filter((category) => category.tone === item) }))
    .filter((group) => group.items.length > 0);

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid gap-5">
      {selected.map((category) => (
        <input key={category.id} type="hidden" name="category_id" value={category.id} />
      ))}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {selected.length === 0 ? "Ninguna asignada" : `${selected.length} asignada${selected.length === 1 ? "" : "s"}`}
        </p>
        {selected.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {selected.map((category) => (
              <button
                key={category.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-950"
                type="button"
                onClick={() => toggle(category.id)}
              >
                {category.name}
                <X size={12} strokeWidth={2} />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Toca una categoría de abajo para asignarla.</p>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" size={14} />
        <Input
          aria-label="Buscar categoría"
          className="w-full pl-8"
          placeholder="Buscar categoría"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800">
        <ToneTab active={tone === "all"} onClick={() => setTone("all")}>
          Todas
        </ToneTab>
        {tones.map((item) => (
          <ToneTab key={item} active={tone === item} onClick={() => setTone(item)}>
            {toneLabel(item)}
          </ToneTab>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay categorías con ese filtro.</p>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <div key={group.tone}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{toneLabel(group.tone)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.items.map((category) => (
                  <button
                    key={category.id}
                    className="cursor-pointer rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    type="button"
                    onClick={() => toggle(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToneTab({
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
        "-mb-px border-b-2 px-3 py-2 text-sm transition-colors cursor-pointer",
        active
          ? "border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-50"
          : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
