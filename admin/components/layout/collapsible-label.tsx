import { cn } from "@/lib/cn";

export function CollapsibleLabel({
  collapsed,
  children,
  className,
}: {
  collapsed: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid transition-[grid-template-columns,opacity] duration-300 ease-in-out",
        collapsed ? "grid-cols-[0fr] opacity-0" : "grid-cols-[1fr] opacity-100",
        className,
      )}
    >
      <span className="min-w-0 overflow-hidden whitespace-nowrap">{children}</span>
    </span>
  );
}
