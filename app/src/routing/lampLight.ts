import aristasJson from "@/assets/geojson/aristas_red.json";
import postesJson from "@/assets/geojson/postes.json";
import semillaJson from "@/assets/geojson/postes.semilla.json";
import { CAMPUS_BOUNDS } from "@/constants/map";
import { LAMP_KINDS } from "@/constants/mapTheme";

/**
 * Charcos de luz con las mismas medidas que el mapa (`buildLampData` en CampusMap):
 * peatonal en la base, vial unos 2,7 m bajo la bombilla. Un poste dañado no ilumina.
 * `postes.semilla.json` se suma aquí; vaciarlo o dejar de importarlo quita la prueba.
 */

type LonLat = [number, number];

type LampFeature = {
  geometry?: { type?: string; coordinates?: number[] } | null;
  properties?: {
    tipo?: string;
    rumbo?: number | null;
    brazos?: number | null;
    radio_m?: number | null;
    estado?: string | null;
  } | null;
};

const CENTER_LAT = (CAMPUS_BOUNDS.minLat + CAMPUS_BOUNDS.maxLat) / 2;
const M_LAT = 110540;
const M_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);
/** Igual que el mapa: el charco vial se centra en `reach + 0,3`. */
const BULB_PAST_REACH_M = 0.3;
const SAMPLE_M = 2;

type LightPool = { longitude: number; latitude: number; radiusM: number };

let poolsCache: LightPool[] | null = null;

export function campusLampPosts() {
  const real = postesJson as { features: unknown[] };
  const seed = semillaJson as { features: unknown[] };
  return {
    type: "FeatureCollection" as const,
    features: [...real.features, ...seed.features],
  };
}

function offsetLngLat(lon: number, lat: number, east: number, north: number): LonLat {
  return [lon + east / M_LON, lat + north / M_LAT];
}

function planarM(a: LonLat, b: LonLat): number {
  const dx = (b[0] - a[0]) * M_LON;
  const dy = (b[1] - a[1]) * M_LAT;
  return Math.hypot(dx, dy);
}

function haversineM(a: LonLat, b: LonLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathLines(): LonLat[][] {
  const features = (aristasJson as { features?: { geometry?: { type?: string; coordinates?: unknown } }[] })
    .features ?? [];
  const lines: LonLat[][] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const parts =
      geometry.type === "LineString"
        ? [geometry.coordinates as number[][]]
        : geometry.type === "MultiLineString"
          ? (geometry.coordinates as number[][][])
          : [];
    for (const part of parts) {
      const line: LonLat[] = [];
      for (const coord of part) {
        if (!coord || coord.length < 2) continue;
        line.push([coord[0], coord[1]]);
      }
      if (line.length >= 2) lines.push(line);
    }
  }
  return lines;
}

/** Rumbo en grados desde el norte, hacia el punto más cercano de algún camino. */
function bearingToNearestPath(lon: number, lat: number, lines: LonLat[][]): number {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const coords of lines) {
    for (let i = 1; i < coords.length; i++) {
      const ax = (coords[i - 1][0] - lon) * M_LON;
      const ay = (coords[i - 1][1] - lat) * M_LAT;
      const dx = (coords[i][0] - lon) * M_LON - ax;
      const dy = (coords[i][1] - lat) * M_LAT - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const cx = ax + dx * t;
      const cy = ay + dy * t;
      const d = cx * cx + cy * cy;
      if (d < bestD) {
        bestD = d;
        best = [cx, cy];
      }
    }
  }
  if (!best || bestD < 0.01) return 0;
  return (Math.atan2(best[0], best[1]) * 180) / Math.PI;
}

function lightPools(): LightPool[] {
  if (poolsCache) return poolsCache;
  const lines = pathLines();
  const features = campusLampPosts().features as LampFeature[];
  const pools: LightPool[] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry || geometry.type !== "Point" || !geometry.coordinates) continue;
    const lon = geometry.coordinates[0];
    const lat = geometry.coordinates[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const props = feature.properties ?? {};
    if (props.estado === "dañado") continue;
    const kind = props.tipo === "vial" ? "vial" : "peatonal";
    const spec = LAMP_KINDS[kind];
    const radius = props.radio_m != null && props.radio_m > 0 ? props.radio_m : spec.radius;
    if (kind === "peatonal") {
      pools.push({ longitude: lon, latitude: lat, radiusM: radius });
      continue;
    }
    const bearing =
      typeof props.rumbo === "number" && Number.isFinite(props.rumbo)
        ? props.rumbo
        : bearingToNearestPath(lon, lat, lines);
    const arms = props.brazos === 2 ? 2 : 1;
    const rad = (bearing * Math.PI) / 180;
    const reach = spec.reach + BULB_PAST_REACH_M;
    for (let arm = 0; arm < arms; arm++) {
      const sign = arm === 0 ? 1 : -1;
      const center = offsetLngLat(lon, lat, Math.sin(rad) * sign * reach, Math.cos(rad) * sign * reach);
      pools.push({ longitude: center[0], latitude: center[1], radiusM: radius });
    }
  }
  poolsCache = pools;
  return pools;
}

function covers(point: LonLat, pools: LightPool[]): boolean {
  for (const pool of pools) {
    if (planarM(point, [pool.longitude, pool.latitude]) <= pool.radiusM) return true;
  }
  return false;
}

function pointAt(coords: LonLat[], cum: number[], distance: number): LonLat {
  const total = cum[cum.length - 1] ?? 0;
  if (distance <= 0) return coords[0];
  if (distance >= total) return coords[coords.length - 1];
  let i = 0;
  while (i + 1 < cum.length && cum[i + 1] < distance) i++;
  const span = cum[i + 1] - cum[i];
  const t = span === 0 ? 0 : (distance - cum[i]) / span;
  const a = coords[i];
  const b = coords[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Metros de `weight` que quedan fuera de todo charco. */
export function darkMeters(coords: LonLat[], weight: number): number {
  if (!(weight > 0)) return 0;
  if (coords.length < 2) return weight;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineM(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  if (!(total > 0)) return weight;
  const pools = lightPools();
  let dark = 0;
  let cursor = 0;
  while (cursor < total - 1e-6) {
    const next = Math.min(total, cursor + SAMPLE_M);
    if (!covers(pointAt(coords, cum, (cursor + next) / 2), pools)) dark += next - cursor;
    cursor = next;
  }
  const scaled = (dark / total) * weight;
  return Math.min(weight, Math.max(0, scaled));
}
