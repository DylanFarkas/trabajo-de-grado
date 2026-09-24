"use client";

import { createClient } from "@/lib/supabase/client";

export function GoogleButton() {
  async function signIn() {
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) {
      window.location.assign("/?error=auth");
    }
  }

  return (
    <button
      className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm text-white"
      type="button"
      onClick={signIn}
    >
      Continuar con Google
    </button>
  );
}
