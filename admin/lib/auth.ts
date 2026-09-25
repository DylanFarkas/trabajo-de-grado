import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "user" | "admin";
};

export async function getSessionProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  return (profile as Profile | null) ?? null;
}

export async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") redirect("/");
  return profile;
}
