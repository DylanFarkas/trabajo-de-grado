import { redirect } from "next/navigation";

import { RouteForm } from "@/app/routes/route-form";
import { Shell } from "@/app/shell";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewRoutePage() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data: places, error } = await supabase.from("places").select("id, name, kind").order("name");

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Nueva ruta</h1>
      {error ? <p className="mt-4 text-sm text-red-700">{error.message}</p> : null}
      <RouteForm name="" description="" published={false} stopIds={[]} places={places ?? []} />
    </Shell>
  );
}
