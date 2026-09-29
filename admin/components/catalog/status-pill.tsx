import { cn } from "@/lib/cn";

export function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "muted" | "warn" | "danger";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs",
        tone === "ok" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        tone === "muted" && "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
        tone === "warn" && "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
        tone === "danger" && "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" && "bg-emerald-500",
          tone === "muted" && "bg-zinc-400",
          tone === "warn" && "bg-amber-500",
          tone === "danger" && "bg-red-500",
        )}
      />
      {children}
    </span>
  );
}
