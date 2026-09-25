import Link from "next/link";

export function LinkList({
  items,
}: {
  items: { href: string; title: string; meta?: React.ReactNode }[];
}) {
  return (
    <ul className="mt-6 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            href={item.href}
          >
            <span className="font-medium">{item.title}</span>
            {item.meta != null ? (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{item.meta}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
