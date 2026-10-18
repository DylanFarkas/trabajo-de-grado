import type { LatLng } from "./graph";

/** Perfiles de la app. `driving-motorcycle` usa `driving-car` en OpenRouteService (no hay perfil moto). */
export type StreetProfile =
  | "foot-walking"
  | "driving-car"
  | "cycling-regular"
  | "driving-motorcycle";

const ORS_API_PROFILE: Record<StreetProfile, "foot-walking" | "driving-car" | "cycling-regular"> = {
  "foot-walking": "foot-walking",
  "driving-car": "driving-car",
  "cycling-regular": "cycling-regular",
  "driving-motorcycle": "driving-car",
};

const OSRM_PROFILE: Record<StreetProfile, "walking" | "driving" | "cycling"> = {
  "foot-walking": "walking",
  "driving-car": "driving",
  "cycling-regular": "cycling",
  "driving-motorcycle": "driving",
};

export type StreetSource = "openrouteservice" | "osrm";

export type StreetRouteResult = {
  coordinates: [number, number][];
  distanceM: number;
  durationS: number;
  origin: LatLng;
  destination: LatLng;
  source: StreetSource;
};

const ORS_URL = "https://api.openrouteservice.org/v2/directions";
const OSRM_URL = "https://router.project-osrm.org/route/v1";
const STREET_TIMEOUT_MS = 8_000;

function getApiKey(): string | null {
  return process.env.EXPO_PUBLIC_ORS_API_KEY?.trim() || null;
}

type OrsGeoJsonResponse = {
  features?: Array<{
    properties?: {
      summary?: { distance?: number; duration?: number };
    };
    geometry?: {
      type?: string;
      coordinates?: [number, number][] | [number, number, number][];
    };
  }>;
  error?: { message?: string; code?: number };
};

type OsrmRouteResponse = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { type?: string; coordinates?: [number, number][] };
  }>;
};

function streetFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const name = error instanceof Error ? error.name : "";
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /cancel|abort|timed?\s*out|network request failed|fetch failed/i.test(message)
  ) {
    return "El servicio de calles no respondió. Inténtalo de nuevo.";
  }
  if (message) return message;
  return "No se pudo calcular el tramo de calle";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("El servicio de calles no respondió. Inténtalo de nuevo."));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toStreetResult(
  coordinates: [number, number][],
  distanceM: number,
  durationS: number,
  origin: LatLng,
  destination: LatLng,
  source: StreetSource,
): StreetRouteResult {
  if (coordinates.length < 2) {
    throw new Error("El servicio de calles no devolvió geometría de ruta");
  }
  return { coordinates, distanceM, durationS, origin, destination, source };
}

async function fetchFromOrs(
  origin: LatLng,
  destination: LatLng,
  profile: StreetProfile,
  apiKey: string,
): Promise<StreetRouteResult> {
  const url = `${ORS_URL}/${ORS_API_PROFILE[profile]}/geojson`;
  const raw = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
      },
      body: JSON.stringify({
        coordinates: [
          [origin.longitude, origin.latitude],
          [destination.longitude, destination.latitude],
        ],
        instructions: false,
        elevation: false,
      }),
    }).then(async (response) => {
      const data = (await response.json()) as OrsGeoJsonResponse;
      if (!response.ok) {
        throw new Error(data.error?.message || `OpenRouteService respondió ${response.status}`);
      }
      return data;
    }),
    STREET_TIMEOUT_MS,
  );

  const feature = raw.features?.[0];
  const geometry = feature?.geometry;
  if (!geometry?.coordinates?.length) {
    throw new Error("OpenRouteService no devolvió geometría de ruta");
  }
  const coordinates: [number, number][] = geometry.coordinates.map((c) => [c[0], c[1]]);
  const summary = feature?.properties?.summary;
  const distanceM =
    typeof summary?.distance === "number" ? summary.distance : estimateDistanceM(coordinates);
  const durationS =
    typeof summary?.duration === "number" ? summary.duration : distanceM / 1.4;
  return toStreetResult(coordinates, distanceM, durationS, origin, destination, "openrouteservice");
}

/** Respaldo público cuando OpenRouteService no responde. */
async function fetchFromOsrm(
  origin: LatLng,
  destination: LatLng,
  profile: StreetProfile,
): Promise<StreetRouteResult> {
  const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `${OSRM_URL}/${OSRM_PROFILE[profile]}/${coords}?overview=full&geometries=geojson`;
  const raw = await withTimeout(
    fetch(url).then(async (response) => {
      const data = (await response.json()) as OsrmRouteResponse;
      if (!response.ok || data.code !== "Ok") {
        throw new Error(data.message || `El respaldo de calles respondió ${response.status}`);
      }
      return data;
    }),
    STREET_TIMEOUT_MS,
  );

  const route = raw.routes?.[0];
  const coordinates = route?.geometry?.coordinates ?? [];
  const distanceM =
    typeof route?.distance === "number" ? route.distance : estimateDistanceM(coordinates);
  const durationS = typeof route?.duration === "number" ? route.duration : distanceM / 1.4;
  return toStreetResult(coordinates, distanceM, durationS, origin, destination, "osrm");
}

/**
 * Tramo de calle: OpenRouteService si responde; si no, OSRM.
 * Coordenadas GeoJSON [lon, lat].
 */
export async function fetchStreetRoute(
  origin: LatLng,
  destination: LatLng,
  profile: StreetProfile = "foot-walking",
): Promise<StreetRouteResult> {
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      return await fetchFromOrs(origin, destination, profile, apiKey);
    } catch {
      // ORS a veces acepta la conexión y no contesta; el respaldo sigue.
    }
  }

  try {
    return await fetchFromOsrm(origin, destination, profile);
  } catch (error) {
    throw new Error(streetFailure(error));
  }
}

function estimateDistanceM(coordinates: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    total += haversineM(
      { longitude: lon1, latitude: lat1 },
      { longitude: lon2, latitude: lat2 },
    );
  }
  return total;
}

export function streetSourceLabel(source: StreetSource | null | undefined): string | null {
  if (source === "openrouteservice") return "calles ORS";
  if (source === "osrm") return "calles OSRM";
  return null;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
