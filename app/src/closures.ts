import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  NO_CLOSURES,
  isSegmentKey,
  type ClosureImpact,
  type SegmentKey,
} from "@/routing/graph";
import { supabase } from "@/supabase";

export const CLOSURE_DESCRIPTION_MIN = 10;
export const CLOSURE_DESCRIPTION_MAX = 500;
export const CLOSURE_MAX_SEGMENTS = 40;

export type ClosureStatus =
  | "candidate"
  | "provisional"
  | "confirmed"
  | "expired"
  | "reopened"
  | "rejected";

export type ClosureCategory = "obra" | "evento" | "inundacion" | "dano" | "otro";
export type ClosureVote = "still_closed" | "now_open";

export const CLOSURE_CATEGORIES: { id: ClosureCategory; label: string }[] = [
  { id: "obra", label: "Obra" },
  { id: "evento", label: "Evento" },
  { id: "inundacion", label: "Inundación" },
  { id: "dano", label: "Daño en la vía" },
  { id: "otro", label: "Otro" },
];

export const CLOSURE_DURATIONS: { hours: number | null; label: string }[] = [
  { hours: null, label: "No sé" },
  { hours: 2, label: "Unas horas" },
  { hours: 24, label: "Hoy" },
  { hours: 72, label: "Varios días" },
];

export const CLOSURE_STATUS_LABEL: Record<ClosureStatus, string> = {
  candidate: "Por confirmar",
  provisional: "Reportada en el sitio",
  confirmed: "Cerrada",
  expired: "Venció",
  reopened: "Reabierta",
  rejected: "Rechazada",
};

export function categoryLabel(category: ClosureCategory): string {
  return CLOSURE_CATEGORIES.find((item) => item.id === category)?.label ?? "Otro";
}

export type ActiveClosure = {
  id: number;
  source: "community" | "admin";
  category: ClosureCategory;
  description: string;
  status: Extract<ClosureStatus, "candidate" | "provisional" | "confirmed">;
  estimatedHours: number | null;
  confirmScore: number;
  denyScore: number;
  lastConfirmedAt: string | null;
  expiresAt: string;
  createdAt: string;
  segmentKeys: SegmentKey[];
  /** Lo reportó el usuario con sesión. Siempre false sin sesión. */
  mine: boolean;
};

export type MyReport = {
  id: number;
  category: ClosureCategory;
  description: string;
  status: ClosureStatus;
  onSite: boolean;
  confirmScore: number;
  denyScore: number;
  reviewNote: string | null;
  segmentCount: number;
  expiresAt: string;
  createdAt: string;
};

const CACHE_KEY = "campus-closures-v1";
const MAX_AGE_MS = 60_000;

type ClosureCache = {
  fetchedAt: number;
  /** Usuario con el que se pidió. Los candidatos solo los ve alguien con sesión. */
  userId: string | null;
  closures: ActiveClosure[];
};

type ActiveRow = {
  id: number;
  source: ActiveClosure["source"];
  category: ClosureCategory;
  description: string;
  status: ActiveClosure["status"];
  estimated_hours: number | null;
  confirm_score: number;
  deny_score: number;
  last_confirmed_at: string | null;
  expires_at: string;
  created_at: string;
  reported_by?: string;
  closure_segments: { segment_key: string }[];
};

type OwnRow = {
  id: number;
  category: ClosureCategory;
  description: string;
  status: ClosureStatus;
  on_site_report: boolean;
  confirm_score: number;
  deny_score: number;
  review_note: string | null;
  expires_at: string;
  created_at: string;
  closure_segments: { segment_key: string }[];
};

function client() {
  if (!supabase) throw new Error("Falta la configuración de Supabase en la app.");
  return supabase;
}

function friendlyError(error: { code?: string; message: string; details?: string | null }): Error {
  const detail = error.details?.trim();
  switch (error.message) {
    case "closure_overlap":
      return Object.assign(new Error("Ese tramo ya tiene un reporte activo. Valídalo en lugar de crear otro."), {
        closureId: Number(detail) || null,
      });
    case "closure_limit":
    case "closure_own_vote":
    case "closure_resolved":
    case "closure_not_found":
    case "closure_segments":
    case "closure_expiry":
    case "closure_transition":
      return new Error(detail || "No se pudo guardar el reporte.");
  }
  if (error.code === "42501") return new Error("No tienes permiso para hacer esto. Vuelve a iniciar sesión.");
  if (error.code === "23514") return new Error("Revisa la descripción: entre 10 y 500 caracteres.");
  return new Error(error.message);
}

/** Id del cierre que ya cubre el tramo, cuando el reporte choca con otro. */
export function overlappingClosureId(error: unknown): number | null {
  const id = (error as { closureId?: unknown } | null)?.closureId;
  return typeof id === "number" ? id : null;
}

function toActive(row: ActiveRow, userId: string | null): ActiveClosure {
  return {
    id: row.id,
    source: row.source,
    category: row.category,
    description: row.description,
    status: row.status,
    estimatedHours: row.estimated_hours,
    confirmScore: row.confirm_score,
    denyScore: row.deny_score,
    lastConfirmedAt: row.last_confirmed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    segmentKeys: row.closure_segments.map((s) => s.segment_key).filter(isSegmentKey),
    mine: userId != null && row.reported_by === userId,
  };
}

function stillOpen(closure: ActiveClosure, now = Date.now()): boolean {
  return new Date(closure.expiresAt).getTime() > now;
}

async function readCache(): Promise<ClosureCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClosureCache;
    if (!Array.isArray(parsed?.closures) || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Lo último guardado, sin red. Sirve para pintar mientras llega lo nuevo. */
export async function cachedClosures(userId: string | null): Promise<ActiveClosure[] | null> {
  const cache = await readCache();
  if (!cache || cache.userId !== userId) return null;
  return cache.closures.filter((closure) => stillOpen(closure));
}

/**
 * Cierres vivos: reportados en el sitio y confirmados para todos; los por confirmar
 * solo con sesión. Usa el cache si tiene menos de 60 s y es del mismo usuario.
 */
export async function fetchActiveClosures(
  userId: string | null,
  options: { force?: boolean } = {},
): Promise<ActiveClosure[]> {
  if (!options.force) {
    const cache = await readCache();
    if (cache && cache.userId === userId && Date.now() - cache.fetchedAt < MAX_AGE_MS) {
      return cache.closures.filter((closure) => stillOpen(closure));
    }
  }

  const columns =
    "id, source, category, description, status, estimated_hours, confirm_score, deny_score, last_confirmed_at, expires_at, created_at, closure_segments(segment_key)";
  const statuses = userId ? ["candidate", "provisional", "confirmed"] : ["provisional", "confirmed"];
  const { data, error } = await client()
    .from("road_closures")
    .select(userId ? `${columns}, reported_by` : columns)
    .in("status", statuses)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .overrideTypes<ActiveRow[], { merge: false }>();
  if (error) throw friendlyError(error);

  const closures = (data ?? []).map((row) => toActive(row, userId)).filter((c) => c.segmentKeys.length > 0);
  const cache: ClosureCache = { fetchedAt: Date.now(), userId, closures };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)).catch(() => {});
  return closures;
}

/** Confirmados bloquean el tramo, reportados en el sitio lo castigan. Los por confirmar no cambian rutas. */
export function closureImpact(closures: readonly ActiveClosure[]): ClosureImpact {
  const blocked = new Set<SegmentKey>();
  const penalized = new Set<SegmentKey>();
  for (const closure of closures) {
    if (closure.status === "confirmed") closure.segmentKeys.forEach((key) => blocked.add(key));
    else if (closure.status === "provisional") closure.segmentKeys.forEach((key) => penalized.add(key));
  }
  for (const key of blocked) penalized.delete(key);
  if (blocked.size === 0 && penalized.size === 0) return NO_CLOSURES;
  return { blocked, penalized };
}

/** "Evitar de todos modos": los tramos elegidos pasan a bloqueados. */
export function avoidSegments(impact: ClosureImpact, keys: Iterable<SegmentKey>): ClosureImpact {
  const blocked = new Set(impact.blocked);
  const penalized = new Set(impact.penalized);
  for (const key of keys) {
    blocked.add(key);
    penalized.delete(key);
  }
  return { blocked, penalized };
}

/** "Mostrar ruta igualmente": ningún tramo se bloquea, todos los cerrados se castigan. */
export function relaxImpact(impact: ClosureImpact): ClosureImpact {
  return { blocked: new Set(), penalized: new Set([...impact.blocked, ...impact.penalized]) };
}

export type ReportInput = {
  segmentKeys: SegmentKey[];
  category: ClosureCategory;
  description: string;
  onSite: boolean;
  positionSource: "simulated" | "gps";
  estimatedHours: number | null;
};

/** Crea el reporte y devuelve su id. El estado inicial lo decide la base. */
export async function reportClosure(input: ReportInput): Promise<number> {
  const { data, error } = await client().rpc("report_closure", {
    p_segment_keys: input.segmentKeys,
    p_category: input.category,
    p_description: input.description.trim(),
    p_on_site: input.onSite,
    p_position_source: input.positionSource,
    p_estimated_hours: input.estimatedHours,
  });
  if (error) throw friendlyError(error);
  return Number(data);
}

/** Vota o cambia el voto. Cada voto recalcula el estado del cierre en la base. */
export async function voteClosure(
  closureId: number,
  userId: string,
  vote: ClosureVote,
  onSite: boolean,
  positionSource: "simulated" | "gps",
) {
  const { error } = await client()
    .from("closure_votes")
    .upsert(
      {
        closure_id: closureId,
        voter_id: userId,
        vote,
        on_site: onSite,
        position_source: positionSource,
      },
      { onConflict: "closure_id,voter_id" },
    );
  if (error) throw friendlyError(error);
}

/** Voto propio por cierre. */
export async function fetchMyVotes(userId: string): Promise<Map<number, ClosureVote>> {
  const { data, error } = await client()
    .from("closure_votes")
    .select("closure_id, vote")
    .eq("voter_id", userId)
    .overrideTypes<{ closure_id: number; vote: ClosureVote }[], { merge: false }>();
  if (error) throw friendlyError(error);
  return new Map((data ?? []).map((row) => [row.closure_id, row.vote]));
}

/** Todos los reportes del usuario, en cualquier estado. */
export async function fetchMyReports(userId: string): Promise<MyReport[]> {
  const { data, error } = await client()
    .from("road_closures")
    .select(
      "id, category, description, status, on_site_report, confirm_score, deny_score, review_note, expires_at, created_at, closure_segments(segment_key)",
    )
    .eq("reported_by", userId)
    .eq("source", "community")
    .order("created_at", { ascending: false })
    .limit(50)
    .overrideTypes<OwnRow[], { merge: false }>();
  if (error) throw friendlyError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    description: row.description,
    status: row.status,
    onSite: row.on_site_report,
    confirmScore: row.confirm_score,
    denyScore: row.deny_score,
    reviewNote: row.review_note,
    segmentCount: row.closure_segments.length,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

/** Un reporte por confirmar cuyo plazo ya pasó, pero el job de 5 min aún no lo cerró. */
export function effectiveStatus(report: Pick<MyReport, "status" | "expiresAt">): ClosureStatus {
  const open = report.status === "candidate" || report.status === "provisional" || report.status === "confirmed";
  if (open && new Date(report.expiresAt).getTime() <= Date.now()) return "expired";
  return report.status;
}

const PROMPTS_KEY = "closure-prompts-v2";
const PROMPT_EVERY_MS = 6 * 60 * 60 * 1000;

type PromptLog = Record<string, Record<string, number>>;

async function readPrompts(): Promise<PromptLog> {
  try {
    const raw = await AsyncStorage.getItem(PROMPTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as PromptLog) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function freshPrompts(prompts: Record<string, number> | undefined, now: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(prompts ?? {}).filter(([, at]) => typeof at === "number" && now - at < PROMPT_EVERY_MS),
  );
}

/** Ids a los que ya se les preguntó "¿sigue cerrada?" a este usuario en las últimas 6 h. */
export async function recentlyPromptedClosures(userId: string | null): Promise<Set<number>> {
  if (!userId) return new Set();
  const prompts = await readPrompts();
  return new Set(Object.keys(freshPrompts(prompts[userId], Date.now())).map(Number));
}

export async function markClosurePrompted(closureId: number, userId: string | null) {
  if (!userId) return;
  const prompts = await readPrompts();
  const now = Date.now();
  const kept = freshPrompts(prompts[userId], now);
  kept[String(closureId)] = now;
  prompts[userId] = kept;
  await AsyncStorage.setItem(PROMPTS_KEY, JSON.stringify(prompts)).catch(() => {});
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}
