import { cn } from "@/lib/cn";

export function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs",
        tone === "ok" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        tone === "muted" && "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone === "ok" ? "bg-emerald-500" : "bg-zinc-400")} />
      {children}
    </span>
  );
}
