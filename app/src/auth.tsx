import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/supabase";

export type UserProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
};

type AuthContextValue = {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const CONFIRM_EMAIL_HINT =
  "Supabase sigue pidiendo confirmar el correo. En Authentication → Providers → Email apaga Confirm email.";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: "user" | "admin";
};

function messageFromUnknown(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message.trim() : "";
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (lower.includes("already registered")) return "Ya existe una cuenta con este correo. Entra con tu contraseña.";
  if (lower.includes("email not confirmed")) return CONFIRM_EMAIL_HINT;
  if (lower.includes("password should be") || lower.includes("password is known")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (lower.includes("unable to validate email")) return "Revisa que el correo esté bien escrito.";
  return raw || fallback;
}

function profileFromSession(session: Session): UserProfile {
  const meta = session.user.user_metadata ?? {};
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    fullName: typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null,
    avatarUrl:
      typeof meta.avatar_url === "string"
        ? meta.avatar_url
        : typeof meta.picture === "string"
          ? meta.picture
          : null,
    role: "user",
  };
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) return null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, role")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      const row = data as ProfileRow;
      return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
        role: row.role === "admin" ? "admin" : "user",
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedUserId = useRef<string | null>(null);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next) {
      loadedUserId.current = null;
      setProfile(null);
      return;
    }

    const fallback = profileFromSession(next);
    setProfile((current) => (current?.id === next.user.id ? current : fallback));

    if (loadedUserId.current === next.user.id) return;
    loadedUserId.current = next.user.id;

    try {
      const row = await fetchProfile(next.user.id);
      if (row) setProfile(row);
    } catch {
      // El fallback de user_metadata cubre nombre y correo.
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      void applySession(data.session).finally(() => {
        if (!cancelled) setLoading(false);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      void applySession(next);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    if (!supabase) {
      setError("Falta la configuración de Supabase en la app.");
      return;
    }

    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) throw signInError;
    } catch (caught) {
      setError(messageFromUnknown(caught, "No se pudo iniciar sesión."));
    } finally {
      setBusy(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    setError(null);
    if (!supabase) {
      setError("Falta la configuración de Supabase en la app.");
      return;
    }

    const normalized = email.trim().toLowerCase();
    const name = fullName?.trim();
    setBusy(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: name ? { data: { full_name: name } } : undefined,
      });
      if (signUpError) throw signUpError;
      if (data.session) return;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (signInError) throw new Error(CONFIRM_EMAIL_HINT);
    } catch (caught) {
      setError(messageFromUnknown(caught, "No se pudo crear la cuenta."));
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      busy,
      error,
      signIn,
      signUp,
      signOut,
    }),
    [session, profile, loading, busy, error, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return value;
}
