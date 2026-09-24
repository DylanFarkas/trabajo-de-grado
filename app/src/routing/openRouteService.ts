import type { LatLng } from "./graph";

export type StreetProfile = "foot-walking" | "driving-car";

export type StreetRouteResult = {
  coordinates: [number, number][];
  distanceM: number;
  durationS: number;
  origin: LatLng;
  destination: LatLng;
};

const ORS_DIRECTIONS_URL =
  "https://api.heigit.org/openrouteservice/v2/directions";

function getApiKey(): string {
  const key = process.env.EXPO_PUBLIC_ORS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Falta EXPO_PUBLIC_ORS_API_KEY en el archivo .env (reinicia Expo tras agregarla)",
    );
  }
  return key;
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

/**
 * Street route via OpenRouteService (HeiGIT) Directions API.
 * Returns GeoJSON LineString coordinates as [lon, lat].
 */
export async function fetchStreetRoute(
  origin: LatLng,
  destination: LatLng,
  profile: StreetProfile = "foot-walking",
): Promise<StreetRouteResult> {
  const apiKey = getApiKey();
  const url = `${ORS_DIRECTIONS_URL}/${profile}/geojson`;

  const response = await fetch(url, {
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
  });

  const raw = (await response.json()) as OrsGeoJsonResponse;

  if (!response.ok) {
    const message =
      raw.error?.message ||
      `OpenRouteService respondió ${response.status}`;
    throw new Error(message);
  }

  const feature = raw.features?.[0];
  const geometry = feature?.geometry;
  if (!geometry?.coordinates?.length) {
    throw new Error("OpenRouteService no devolvió geometría de ruta");
  }

  const coordinates: [number, number][] = geometry.coordinates.map((c) => [
    c[0],
    c[1],
  ]);

  const summary = feature?.properties?.summary;
  const distanceM =
    typeof summary?.distance === "number"
      ? summary.distance
      : estimateDistanceM(coordinates);
  const durationS =
    typeof summary?.duration === "number" ? summary.duration : distanceM / 1.4;

  return {
    coordinates,
    distanceM,
    durationS,
    origin,
    destination,
  };
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
