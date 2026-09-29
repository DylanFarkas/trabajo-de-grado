import { supabase } from "@/supabase";

export const BODY_MAX = 2000;
export const BODY_MIN = 10;

export type ContributionStatus = "pending" | "approved" | "rejected";

export type PublishedInfo = {
  id: number;
  body: string;
  createdAt: string;
};

export type MyContribution = {
  id: number;
  placeId: string;
  placeName: string;
  body: string;
  status: ContributionStatus;
  reviewNote: string | null;
  createdAt: string;
};

type PublicRow = { id: number; body: string; created_at: string };

type OwnRow = {
  id: number;
  place_id: string;
  body: string;
  status: ContributionStatus;
  review_note: string | null;
  created_at: string;
  place: { name: string } | null;
};

export function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function client() {
  if (!supabase) throw new Error("Falta la configuración de Supabase en la app.");
  return supabase;
}

function friendlyError(error: { code?: string; message: string }): Error {
  if (error.code === "23503") return new Error("Este espacio todavía no está registrado en el catálogo.");
  if (error.code === "42501") return new Error("No tienes permiso para hacer esto. Vuelve a iniciar sesión.");
  if (error.code === "23514") return new Error("El texto no puede estar vacío ni pasar del límite.");
  return new Error(error.message);
}

/** Información ya aprobada por un admin. Visible sin sesión. */
export async function fetchPublishedInfo(placeId: string): Promise<PublishedInfo[]> {
  const { data, error } = await client()
    .from("contributions")
    .select("id, body, created_at")
    .eq("place_id", placeId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (error) throw friendlyError(error);
  return ((data ?? []) as PublicRow[]).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
  }));
}

/** Todos los aportes del usuario, en cualquier estado. */
export async function fetchMyContributions(userId: string): Promise<MyContribution[]> {
  const { data, error } = await client()
    .from("contributions")
    .select("id, place_id, body, status, review_note, created_at, place:places(name)")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .overrideTypes<OwnRow[], { merge: false }>();
  if (error) throw friendlyError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    placeId: row.place_id,
    placeName: row.place?.name ?? row.place_id,
    body: row.body,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  }));
}

export async function submitInfo(placeId: string, userId: string, body: string) {
  const { error } = await client()
    .from("contributions")
    .insert({ place_id: placeId, author_id: userId, body: body.trim() });
  if (error) throw friendlyError(error);
}

export async function updateMyInfo(id: number, body: string) {
  const { data, error } = await client()
    .from("contributions")
    .update({ body: body.trim() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw friendlyError(error);
  if (!data || data.length === 0) {
    throw new Error("Este aporte ya fue revisado y no se puede editar.");
  }
}

export async function deleteMyInfo(id: number) {
  const { data, error } = await client()
    .from("contributions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw friendlyError(error);
  if (!data || data.length === 0) {
    throw new Error("Este aporte ya no existe.");
  }
}
