import Link from "next/link";

export function NavCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900" href={href}>
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
    </Link>
  );
}
