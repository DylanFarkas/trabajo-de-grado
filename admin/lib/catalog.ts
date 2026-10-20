export const TONES = ["food", "sport", "library", "culture", "academic"] as const;
export type Tone = (typeof TONES)[number];

export const TONE_LABELS: Record<Tone, string> = {
  food: "Comida",
  sport: "Deporte",
  library: "Biblioteca",
  culture: "Cultura",
  academic: "Facultad",
};

export const KINDS = ["building", "space"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABELS: Record<Kind, string> = {
  building: "Edificio",
  space: "Espacio",
};

export function isTone(value: string): value is Tone {
  return (TONES as readonly string[]).includes(value);
}

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

export function toneLabel(tone: string) {
  return isTone(tone) ? TONE_LABELS[tone] : tone;
}

export function kindLabel(kind: string) {
  return isKind(kind) ? KIND_LABELS[kind] : kind;
}

export const CONTRIBUTION_STATUSES = ["pending", "approved", "rejected"] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export const CONTRIBUTION_STATUS_LABELS: Record<ContributionStatus, string> = {
  pending: "Pendiente",
  approved: "Publicada",
  rejected: "Rechazada",
};

export const CONTRIBUTION_BODY_MAX = 2000;
export const CONTRIBUTION_NOTE_MAX = 500;

export function isContributionStatus(value: string): value is ContributionStatus {
  return (CONTRIBUTION_STATUSES as readonly string[]).includes(value);
}

export function contributionStatusLabel(status: string) {
  return isContributionStatus(status) ? CONTRIBUTION_STATUS_LABELS[status] : status;
}

export const CLOSURE_STATUSES = [
  "candidate",
  "provisional",
  "confirmed",
  "expired",
  "reopened",
  "rejected",
] as const;
export type ClosureStatus = (typeof CLOSURE_STATUSES)[number];

export const CLOSURE_STATUS_LABELS: Record<ClosureStatus, string> = {
  candidate: "Por confirmar",
  provisional: "Reportado en sitio",
  confirmed: "Cerrado",
  expired: "Vencido",
  reopened: "Reabierto",
  rejected: "Rechazado",
};

export const CLOSURE_OPEN_STATUSES: readonly ClosureStatus[] = ["candidate", "provisional", "confirmed"];

export const CLOSURE_CATEGORIES = ["obra", "evento", "inundacion", "dano", "otro"] as const;
export type ClosureCategory = (typeof CLOSURE_CATEGORIES)[number];

export const CLOSURE_CATEGORY_LABELS: Record<ClosureCategory, string> = {
  obra: "Obra",
  evento: "Evento",
  inundacion: "Inundación",
  dano: "Daño en la vía",
  otro: "Otro",
};

/** Duraciones que ofrece el panel. La base acepta hasta 90 días. */
export const CLOSURE_DURATIONS: { hours: number; label: string }[] = [
  { hours: 2, label: "2 horas" },
  { hours: 6, label: "6 horas" },
  { hours: 12, label: "12 horas" },
  { hours: 24, label: "1 día" },
  { hours: 72, label: "3 días" },
  { hours: 168, label: "1 semana" },
  { hours: 720, label: "30 días" },
  { hours: 2160, label: "90 días" },
];

export const CLOSURE_DESCRIPTION_MIN = 10;
export const CLOSURE_DESCRIPTION_MAX = 500;
export const CLOSURE_NOTE_MAX = 500;
export const CLOSURE_MAX_SEGMENTS = 40;

export function isClosureCategory(value: string): value is ClosureCategory {
  return (CLOSURE_CATEGORIES as readonly string[]).includes(value);
}

export function closureStatusLabel(status: string) {
  return (CLOSURE_STATUSES as readonly string[]).includes(status)
    ? CLOSURE_STATUS_LABELS[status as ClosureStatus]
    : status;
}

export function closureCategoryLabel(category: string) {
  return isClosureCategory(category) ? CLOSURE_CATEGORY_LABELS[category] : category;
}

export function closureStatusTone(status: string): "ok" | "muted" | "warn" | "danger" {
  if (status === "confirmed") return "danger";
  if (status === "provisional") return "warn";
  if (status === "reopened") return "ok";
  return "muted";
}
