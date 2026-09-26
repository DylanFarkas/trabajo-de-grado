export function QueryError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-4 text-sm text-red-700 dark:text-red-400">{message}</p>;
}
