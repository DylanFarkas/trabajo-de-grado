import type { CampusPlace } from "@/places";
import type { StreetProfile } from "./openRouteService";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";

export type PlaceCatalogEntry = {
  id: string;
  code: string | null;
  title: string;
};

export type RouteIntent = {
  originPlaceId: string | null;
  destinationPlaceId: string | null;
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

export function buildPlaceCatalog(places: CampusPlace[]): PlaceCatalogEntry[] {
  return places.map((place) => ({
    id: place.id,
    code: place.code,
    title: place.title,
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
    return `- id=${place.id}${code} title="${place.title}"`;
  });

  return [
    "Eres un intérprete de rutas del campus Universidad del Valle (Cali).",
    "Tu única tarea es convertir el pedido del usuario en JSON con IDs del catálogo.",
    "No inventes IDs. Solo usa ids de la lista.",
    "Resuelve alias comunes: biblioteca→Biblioteca Central, códigos como B13/E19, nombres de edificios.",
    "Si el usuario solo menciona destino, originPlaceId debe ser null.",
    "Si no puedes resolver el destino con confianza, destinationPlaceId=null y escribe clarification en español.",
    "profile: foot-walking (pie, caminar) o driving-car (carro, auto); null si no se indica.",
    "Responde SOLO JSON válido con esta forma exacta:",
    '{"originPlaceId":string|null,"destinationPlaceId":string|null,"profile":"foot-walking"|"driving-car"|null,"confidence":number,"clarification":string|null}',
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
    profile: asProfile(obj.profile),
    confidence,
    clarification: asNullableString(obj.clarification),
  };
}

export function findPlaceById(
  places: CampusPlace[],
  id: string | null | undefined,
): CampusPlace | null {
  if (!id) return null;
  return places.find((place) => place.id === id) ?? null;
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

  return normalizeIntent(parseJsonContent(content));
}
