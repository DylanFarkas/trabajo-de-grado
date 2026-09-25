export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  if (!children) {
    return <h1 className="text-2xl font-semibold">{title}</h1>;
  }

  return (
    <div className="flex items-end justify-between gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
