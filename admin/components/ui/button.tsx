import { cn } from "@/lib/cn";

const variants = {
  primary: "rounded-full bg-zinc-950 text-sm text-white dark:bg-zinc-100 dark:text-zinc-950",
  secondary: "rounded-full border border-zinc-300 text-sm dark:border-zinc-600 dark:text-zinc-100",
  danger: "text-sm text-red-700 dark:text-red-400",
  ghost:
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100",
} as const;

const sizes = {
  sm: "px-3 py-1",
  md: "px-4 py-2",
  lg: "px-5 py-2.5",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonClass(
  variant: ButtonVariant = "primary",
  className?: string,
  size: ButtonSize = "md",
) {
  const padded = variant === "primary" || variant === "secondary";
  return cn(variants[variant], padded ? sizes[size] : undefined, className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, className, size)} {...props} />;
}
