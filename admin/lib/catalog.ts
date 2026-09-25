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
