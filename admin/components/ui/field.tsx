import { cn } from "@/lib/cn";

export function Field({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("grid gap-1 text-sm", className)} {...props} />;
}
