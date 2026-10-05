import type { CampusDestination } from "@/destinations";
import type { SpaceKind } from "@/types/campus";
import type { StreetProfile } from "./openRouteService";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";

export type PlaceCatalogEntry = {
  id: string;
  code: string | null;
  title: string;
  kind: "building" | "space";
  spaceKind: SpaceKind | null;
};

export type RouteIntent = {
  originPlaceId: string | null;
  destinationPlaceId: string | null;
  /** Tipo de espacio cuando piden el más cercano y no un sitio concreto. */
  destinationSpaceKind: SpaceKind | null;
  profile: StreetProfile | null;
  confidence: number;
  clarification: string | null;
};

export class RouteIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteIntentError";
  }
}

export function buildPlaceCatalog(destinations: CampusDestination[]): PlaceCatalogEntry[] {
  return destinations.map((item) => ({
    id: item.catalogId ?? item.key,
    code: item.badge,
    title: item.title,
    kind: item.kind,
    spaceKind: item.spaceKind,
  }));
}

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY?.trim();
  if (!key) {
    throw new RouteIntentError(
      "Falta EXPO_PUBLIC_DEEPSEEK_API_KEY en el archivo .env (reinicia Expo tras agregarla)",
    );
  }
  return key;
}

function getModel(): string {
  return process.env.EXPO_PUBLIC_DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
}

function buildSystemPrompt(catalog: PlaceCatalogEntry[]): string {
  const lines = catalog.map((place) => {
    const code = place.code ? ` code=${place.code}` : "";
    const kind =
      place.kind === "space" && place.spaceKind
        ? ` kind=space tipo=${place.spaceKind}`
        : " kind=building";
    return `- id=${place.id}${kind}${code} title="${place.title}"`;
  });

  return [
    "Eres un intérprete de rutas del campus Universidad del Valle (Cali).",
    "Tu única tarea es convertir el pedido del usuario en JSON con IDs del catálogo.",
    "No inventes IDs. Solo usa ids de la lista.",
    "Resuelve alias comunes: biblioteca→Biblioteca Central, códigos como B13/E19, nombres de edificios.",
    "El catálogo también incluye espacios (parqueaderos, baños y canchas). Un espacio concreto se resuelve por su id, etiqueta o nombre: P9, Parqueadero 9.",
    "Si piden el más cercano de un tipo sin nombrar uno (el parqueadero, un baño, la cancha más cercana), destinationPlaceId=null y destinationSpaceKind es bano, parqueadero o cancha. No elijas un edificio aunque su nombre contenga esa palabra.",
    "Si el destino es un sitio concreto, destinationSpaceKind=null.",
    "Si el usuario solo menciona destino, originPlaceId debe ser null.",
    "Si no puedes resolver el destino con confianza, destinationPlaceId=null, destinationSpaceKind=null y escribe clarification en español.",
    "profile: foot-walking (pie, caminar) o driving-car (carro, auto); null si no se indica.",
    "Responde SOLO JSON válido con esta forma exacta:",
    '{"originPlaceId":string|null,"destinationPlaceId":string|null,"destinationSpaceKind":"bano"|"parqueadero"|"cancha"|null,"profile":"foot-walking"|"driving-car"|null,"confidence":number,"clarification":string|null}',
    "",
    "Catálogo de lugares:",
    ...lines,
  ].join("\n");
}

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
};

function parseJsonContent(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new RouteIntentError("El asistente no devolvió JSON válido");
  }
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function asProfile(value: unknown): StreetProfile | null {
  if (value === "foot-walking" || value === "driving-car") return value;
  return null;
}

function asSpaceKind(value: unknown): SpaceKind | null {
  if (value === "bano" || value === "parqueadero" || value === "cancha") return value;
  return null;
}

function normalizeIntent(data: unknown): RouteIntent {
  if (!data || typeof data !== "object") {
    throw new RouteIntentError("Respuesta del asistente inválida");
  }
  const obj = data as Record<string, unknown>;
  const confidenceRaw = obj.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0;

  return {
    originPlaceId: asNullableString(obj.originPlaceId),
    destinationPlaceId: asNullableString(obj.destinationPlaceId),
    destinationSpaceKind: asSpaceKind(obj.destinationSpaceKind),
    profile: asProfile(obj.profile),
    confidence,
    clarification: asNullableString(obj.clarification),
  };
}

/**
 * Ask DeepSeek to map a natural-language campus route request to catalog place IDs.
 */
export async function parseRouteIntent(
  userText: string,
  catalog: PlaceCatalogEntry[],
): Promise<RouteIntent> {
  const text = userText.trim();
  if (!text) {
    throw new RouteIntentError("Escribe a dónde quieres ir");
  }
  if (catalog.length === 0) {
    throw new RouteIntentError("No hay lugares del campus cargados");
  }

  const apiKey = getApiKey();
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages: [
        { role: "system", content: buildSystemPrompt(catalog) },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 400,
      stream: false,
    }),
  });

  const payload = (await response.json()) as DeepSeekChatResponse;
  if (!response.ok) {
    const message = payload.error?.message ?? `DeepSeek HTTP ${response.status}`;
    throw new RouteIntentError(message);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new RouteIntentError("El asistente no devolvió una respuesta");
  }

  return applyNearestSpaceHint(text, normalizeIntent(parseJsonContent(content)));
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** El modelo a veces elige un edificio homónimo. “El más cercano” es un tipo de espacio. */
function applyNearestSpaceHint(userText: string, intent: RouteIntent): RouteIntent {
  const text = normalizeSearchText(userText);
  if (!/mas cercan|mas proxim/.test(text)) return intent;
  if (/desde\s+(el|la|un|una)?\s*(parqueadero|bano|cancha)\s+mas\s+(cercan|proxim)/.test(text)) {
    return intent;
  }

  let spaceKind: SpaceKind | null = null;
  if (/\bparqueadero\b/.test(text) && !/\bparqueadero\s+\d+\b/.test(text) && !/\bp\d+\b/.test(text)) {
    spaceKind = "parqueadero";
  } else if (/\bbano\b/.test(text)) {
    spaceKind = "bano";
  } else if (/\bcancha\b/.test(text)) {
    spaceKind = "cancha";
  }
  if (!spaceKind) return intent;

  return {
    ...intent,
    destinationPlaceId: null,
    destinationSpaceKind: spaceKind,
    clarification: null,
  };
}
