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
