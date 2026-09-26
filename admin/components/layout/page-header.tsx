import Link from "next/link";
import { Home } from "lucide-react";

export type Crumb = {
  label: string;
  href?: string;
};

export function PageHeader({
  crumbs,
  title,
  subtitle,
  children,
}: {
  crumbs?: Crumb[];
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header>
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label="Migas de pan" className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-zinc-400 dark:text-zinc-500">
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-x-1.5">
                {index > 0 ? <span aria-hidden>/</span> : null}
                {crumb.href && !current ? (
                  <Link
                    href={crumb.href}
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    {index === 0 ? <Home size={13} strokeWidth={1.75} /> : null}
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                    {index === 0 ? <Home size={13} strokeWidth={1.75} /> : null}
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div className={crumbs && crumbs.length > 0 ? "mt-5 flex items-start justify-between gap-4" : "flex items-start justify-between gap-4"}>
        <div className="min-w-0">
          <h1 className="text-[3.5rem] font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p> : null}
        </div>
        {children ? <div className="shrink-0 pt-1">{children}</div> : null}
      </div>
    </header>
  );
}
