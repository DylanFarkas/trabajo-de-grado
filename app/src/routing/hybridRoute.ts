import { CAMPUS_BOUNDS } from "@/constants/map";
import {
  CAMPUS_ENTRANCES,
  type CampusEntrance,
} from "@/constants/entrances";
import {
  nearestDriveParking,
  nearestNodeId,
  nodeLatLng,
  parkingForPoint,
  routeBetweenPoints,
  spacePoint,
  type LatLng,
  type RouteResult,
} from "./graph";
import {
  fetchStreetRoute,
  haversineM,
  type StreetProfile,
} from "./openRouteService";

export type RouteLeg = {
  lines: [number, number][][];
  distanceM: number;
};

export type HybridRouteResult = RouteResult & {
  mode: "campus" | "street" | "hybrid";
  durationS: number | null;
  entrance: CampusEntrance | null;
  profile?: StreetProfile;
  /** Tramo en carro. Ausente cuando toda la ruta es a pie. */
  drive: RouteLeg | null;
  /** Tramo a pie de una ruta en carro. */
  walk: RouteLeg | null;
  /** Parqueadero donde se deja o se toma el carro. */
  parking: { name: string; point: LatLng } | null;
  /** Texto corto: "en carro hasta P6 · luego a pie". */
  detail: string | null;
};

export class CampusRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampusRouteError";
  }
}

const ON_ROAD_M = 40;
const CAMPUS_DRIVE_MPS = 6;

export function pointInCampus(point: LatLng): boolean {
  return (
    point.longitude >= CAMPUS_BOUNDS.minLon &&
    point.longitude <= CAMPUS_BOUNDS.maxLon &&
    point.latitude >= CAMPUS_BOUNDS.minLat &&
    point.latitude <= CAMPUS_BOUNDS.maxLat
  );
}

/** Pick the gate that minimizes street approach + optional campus walk. */
export function pickBestEntrance(
  from: LatLng,
  campusDestination: LatLng | null,
): CampusEntrance {
  let best = CAMPUS_ENTRANCES[0];
  let bestScore = Infinity;

  for (const entrance of CAMPUS_ENTRANCES) {
    const streetApprox = haversineM(from, entrance.point);
    let campusM = 0;
    if (campusDestination && !samePoint(entrance.point, campusDestination)) {
      const campusPath = routeBetweenPoints(entrance.point, campusDestination);
      campusM = campusPath?.distanceM ?? haversineM(entrance.point, campusDestination);
    }
    const score = streetApprox + campusM;
    if (score < bestScore) {
      bestScore = score;
      best = entrance;
    }
  }

  return best;
}

/**
 * Routes between any two points:
 * - both on campus → local graph
 * - origin off campus → OpenRouteService to best/selected gate (+ campus graph if dest inside)
 * - both off campus → OpenRouteService direct
 *
 * @param viaEntrance when set (user chose a gate), street segment ends there instead of auto-picking
 */
export async function routeHybrid(
  origin: LatLng,
  destination: LatLng,
  profile: StreetProfile = "foot-walking",
  viaEntrance: LatLng | null = null,
): Promise<HybridRouteResult | null> {
  if (profile === "driving-car") {
    return routeByCar(origin, destination, viaEntrance);
  }

  const originInside = pointInCampus(origin);
  const destInside = pointInCampus(destination);

  if (originInside && destInside) {
    const campus = routeBetweenPoints(origin, destination);
    if (!campus) return null;
    return {
      ...campus,
      mode: "campus",
      durationS: null,
      entrance: null,
      drive: null,
      walk: null,
      parking: null,
      detail: null,
    };
  }

  if (!originInside && !destInside) {
    const street = await fetchStreetRoute(origin, destination, profile);
    return {
      nodeIds: [],
      coordinates: street.coordinates,
      distanceM: street.distanceM,
      origin,
      destination,
      mode: "street",
      durationS: street.durationS,
      entrance: null,
      drive: null,
      walk: null,
      parking: null,
      detail: null,
    };
  }

  // One side outside: outside → campus gate → inside dest (or reverse)
  if (!originInside && destInside) {
    const entrance =
      (viaEntrance
        ? matchEntrance(viaEntrance) ?? {
            id: "custom",
            name: "Entrada elegida",
            street: "Entrada elegida",
            point: viaEntrance,
          }
        : null) ?? pickBestEntrance(origin, destination);

    const street = await fetchStreetRoute(origin, entrance.point, profile);

    const destIsEntrance = samePoint(destination, entrance.point);
    if (destIsEntrance) {
      return {
        nodeIds: [],
        coordinates: street.coordinates,
        distanceM: street.distanceM,
        origin,
        destination: entrance.point,
        mode: "street",
        durationS: street.durationS,
        entrance,
        drive: null,
        walk: null,
        parking: null,
        detail: null,
      };
    }

    const campus = routeBetweenPoints(entrance.point, destination);
    if (!campus) {
      return {
        nodeIds: [],
        coordinates: street.coordinates,
        distanceM: street.distanceM,
        origin,
        destination: entrance.point,
        mode: "street",
        durationS: street.durationS,
        entrance,
        drive: null,
        walk: null,
        parking: null,
        detail: null,
      };
    }

    const coordinates = mergeCoordinates(street.coordinates, campus.coordinates);
    return {
      nodeIds: campus.nodeIds,
      coordinates,
      distanceM: street.distanceM + campus.distanceM,
      origin,
      destination,
      mode: "hybrid",
      durationS: street.durationS + campus.distanceM / 1.4,
      entrance,
      drive: null,
      walk: null,
      parking: null,
      detail: null,
    };
  }

  // origin inside, destination outside
  const entrance =
    (viaEntrance
      ? matchEntrance(viaEntrance) ?? {
          id: "custom",
          name: "Entrada elegida",
          street: "Entrada elegida",
          point: viaEntrance,
        }
      : null) ?? pickBestEntrance(destination, origin);
  const campus = routeBetweenPoints(origin, entrance.point);
  const street = await fetchStreetRoute(entrance.point, destination, profile);

  if (!campus) {
    return {
      nodeIds: [],
      coordinates: street.coordinates,
      distanceM: street.distanceM,
      origin: entrance.point,
      destination,
      mode: "street",
      durationS: street.durationS,
      entrance,
      drive: null,
      walk: null,
      parking: null,
      detail: null,
    };
  }

  return {
    nodeIds: campus.nodeIds,
    coordinates: mergeCoordinates(campus.coordinates, street.coordinates),
    distanceM: campus.distanceM + street.distanceM,
    origin,
    destination,
    mode: "hybrid",
    durationS: street.durationS + campus.distanceM / 1.4,
    entrance,
    drive: null,
    walk: null,
    parking: null,
    detail: null,
  };
}

const NO_PARKING = "No hay un parqueadero accesible en carro cerca de ese destino";
const NO_DRIVE = "No hay una vía en carro hasta ese parqueadero";

function parkingName(space: { etiqueta: string | null; nombre: string }): string {
  return space.etiqueta || space.nombre;
}

function onDriveNetwork(point: LatLng): boolean {
  const id = nearestNodeId(point, "drive");
  const node = id == null ? null : nodeLatLng(id);
  return node != null && haversineM(point, node) <= ON_ROAD_M;
}

function chosenEntrance(viaEntrance: LatLng | null): CampusEntrance | null {
  if (!viaEntrance) return null;
  return (
    matchEntrance(viaEntrance) ?? {
      id: "custom",
      name: "Entrada elegida",
      street: "Entrada elegida",
      point: viaEntrance,
    }
  );
}

/** Portería que minimiza la calle más la conducción interna. */
function pickDrivingGate(
  outside: LatLng,
  campusPoint: LatLng,
  campusIsDestination: boolean,
): CampusEntrance | null {
  let best: CampusEntrance | null = null;
  let bestScore = Infinity;
  for (const entrance of CAMPUS_ENTRANCES) {
    const street = haversineM(outside, entrance.point);
    const drive = campusIsDestination
      ? routeBetweenPoints(entrance.point, campusPoint, "drive")
      : routeBetweenPoints(campusPoint, entrance.point, "drive");
    if (!drive) continue;
    const score = street + drive.distanceM;
    if (score < bestScore) {
      bestScore = score;
      best = entrance;
    }
  }
  return best;
}

function lotPointOf(id: string): LatLng | null {
  return spacePoint(id);
}

async function routeByCar(
  origin: LatLng,
  destination: LatLng,
  viaEntrance: LatLng | null,
): Promise<HybridRouteResult> {
  const originInside = pointInCampus(origin);
  const destInside = pointInCampus(destination);

  if (!originInside && !destInside) {
    const street = await fetchStreetRoute(origin, destination, "driving-car");
    return {
      nodeIds: [],
      coordinates: street.coordinates,
      distanceM: street.distanceM,
      origin,
      destination,
      mode: "street",
      durationS: street.durationS,
      entrance: null,
      drive: { lines: [street.coordinates], distanceM: street.distanceM },
      walk: null,
      parking: null,
      detail: "en carro",
    };
  }

  if (destInside) {
    return routeCarTowardCampus(origin, destination, viaEntrance, originInside);
  }
  return routeCarLeavingCampus(origin, destination, viaEntrance);
}

async function routeCarTowardCampus(
  origin: LatLng,
  destination: LatLng,
  viaEntrance: LatLng | null,
  originInside: boolean,
): Promise<HybridRouteResult> {
  const atLot = parkingForPoint(destination);
  const lot = atLot ?? nearestDriveParking(destination);
  const lotPoint = lot ? lotPointOf(lot.id) : null;
  if (!lot || !lotPoint) throw new CampusRouteError(NO_PARKING);

  const walkAfter = atLot ? null : routeBetweenPoints(lotPoint, destination, "walk");
  if (!atLot && !walkAfter) {
    throw new CampusRouteError("No hay camino a pie desde el parqueadero hasta el destino");
  }

  let walkBefore: RouteResult | null = null;
  let driveFrom = origin;
  let startLotName: string | null = null;
  if (originInside && !onDriveNetwork(origin)) {
    const startLot = nearestDriveParking(origin);
    const startPoint = startLot ? lotPointOf(startLot.id) : null;
    if (!startLot || !startPoint) throw new CampusRouteError(NO_PARKING);
    walkBefore = routeBetweenPoints(origin, startPoint, "walk");
    if (!walkBefore) throw new CampusRouteError("No hay camino a pie hasta un parqueadero");
    driveFrom = startPoint;
    if (startLot.id !== lot.id) startLotName = parkingName(startLot);
  }

  let entrance: CampusEntrance | null = null;
  let streetMeters = 0;
  let streetSeconds = 0;
  const driveLines: [number, number][][] = [];
  if (!originInside) {
    entrance = chosenEntrance(viaEntrance) ?? pickDrivingGate(origin, lotPoint, true);
    if (!entrance) throw new CampusRouteError(NO_DRIVE);
    const street = await fetchStreetRoute(origin, entrance.point, "driving-car");
    streetMeters = street.distanceM;
    streetSeconds = street.durationS;
    driveLines.push(street.coordinates);
    driveFrom = entrance.point;
  }

  const driveCampus = samePoint(driveFrom, lotPoint)
    ? null
    : routeBetweenPoints(driveFrom, lotPoint, "drive");
  if (!samePoint(driveFrom, lotPoint) && !driveCampus) throw new CampusRouteError(NO_DRIVE);
  if (driveCampus && driveCampus.coordinates.length >= 2) driveLines.push(driveCampus.coordinates);

  const walkLines: [number, number][][] = [];
  if (walkBefore && walkBefore.coordinates.length >= 2) walkLines.push(walkBefore.coordinates);
  if (walkAfter && walkAfter.coordinates.length >= 2) walkLines.push(walkAfter.coordinates);

  const driveM = streetMeters + (driveCampus?.distanceM ?? 0);
  const walkM = (walkBefore?.distanceM ?? 0) + (walkAfter?.distanceM ?? 0);
  const coordinates = driveLines.concat(walkLines).reduce(mergeCoordinates, [] as [number, number][]);
  const lotLabel = parkingName(lot);
  const drove = driveM >= 1;
  const parts = [
    startLotName ? `a pie hasta ${startLotName}` : null,
    drove ? (atLot && !startLotName ? "en carro" : `en carro hasta ${lotLabel}`) : null,
    walkAfter ? (drove || startLotName ? "luego a pie" : "a pie") : null,
  ].filter(Boolean);

  return {
    nodeIds: driveCampus?.nodeIds ?? [],
    coordinates,
    distanceM: driveM + walkM,
    origin,
    destination,
    mode: walkLines.length || entrance ? "hybrid" : "campus",
    durationS: streetSeconds + (driveCampus?.distanceM ?? 0) / CAMPUS_DRIVE_MPS + walkM / 1.4,
    entrance,
    drive: driveLines.length ? { lines: driveLines, distanceM: driveM } : null,
    walk: walkLines.length ? { lines: walkLines, distanceM: walkM } : null,
    parking: atLot ? null : { name: lotLabel, point: lotPoint },
    detail: parts.join(" · ") || null,
  };
}

async function routeCarLeavingCampus(
  origin: LatLng,
  destination: LatLng,
  viaEntrance: LatLng | null,
): Promise<HybridRouteResult> {
  let driveFrom = origin;
  let walkBefore: RouteResult | null = null;
  let parking: { name: string; point: LatLng } | null = null;

  if (!onDriveNetwork(origin)) {
    const startLot = nearestDriveParking(origin);
    const startPoint = startLot ? lotPointOf(startLot.id) : null;
    if (!startLot || !startPoint) throw new CampusRouteError(NO_PARKING);
    walkBefore = routeBetweenPoints(origin, startPoint, "walk");
    if (!walkBefore) throw new CampusRouteError("No hay camino a pie hasta un parqueadero");
    driveFrom = startPoint;
    parking = { name: parkingName(startLot), point: startPoint };
  }

  const entrance = chosenEntrance(viaEntrance) ?? pickDrivingGate(destination, driveFrom, false);
  if (!entrance) throw new CampusRouteError(NO_DRIVE);
  const driveCampus = samePoint(driveFrom, entrance.point)
    ? null
    : routeBetweenPoints(driveFrom, entrance.point, "drive");
  if (!samePoint(driveFrom, entrance.point) && !driveCampus) throw new CampusRouteError(NO_DRIVE);
  const street = await fetchStreetRoute(entrance.point, destination, "driving-car");

  const driveLines: [number, number][][] = [];
  if (driveCampus && driveCampus.coordinates.length >= 2) driveLines.push(driveCampus.coordinates);
  if (street.coordinates.length >= 2) driveLines.push(street.coordinates);
  const walkLines = walkBefore && walkBefore.coordinates.length >= 2 ? [walkBefore.coordinates] : [];
  const driveM = (driveCampus?.distanceM ?? 0) + street.distanceM;
  const walkM = walkBefore?.distanceM ?? 0;
  const coordinates = walkLines.concat(driveLines).reduce(mergeCoordinates, [] as [number, number][]);

  return {
    nodeIds: driveCampus?.nodeIds ?? [],
    coordinates,
    distanceM: driveM + walkM,
    origin,
    destination,
    mode: "hybrid",
    durationS: street.durationS + (driveCampus?.distanceM ?? 0) / CAMPUS_DRIVE_MPS + walkM / 1.4,
    entrance,
    drive: { lines: driveLines, distanceM: driveM },
    walk: walkLines.length ? { lines: walkLines, distanceM: walkM } : null,
    parking,
    detail: parking ? `a pie hasta ${parking.name} · luego en carro` : "en carro",
  };
}

function matchEntrance(point: LatLng): CampusEntrance | null {
  for (const entrance of CAMPUS_ENTRANCES) {
    if (samePoint(entrance.point, point, 1e-4)) return entrance;
  }
  return null;
}

function samePoint(a: LatLng, b: LatLng, eps = 1e-5): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < eps &&
    Math.abs(a.longitude - b.longitude) < eps
  );
}

/**
 * Orders stops so the walk from `origin` visits each one once and the campus
 * path is as short as possible. The admin order is only the set of places.
 * `origin` stays first; in production that point is the real GPS fix.
 */
export function orderStopsFromOrigin<T extends { point: LatLng }>(
  origin: LatLng,
  stops: T[],
): T[] | null {
  if (stops.length <= 1) return [...stops];

  const nodes = [origin, ...stops.map((stop) => stop.point)];
  const size = nodes.length;
  const dist = Array.from({ length: size }, () => Array<number>(size).fill(Infinity));
  for (let i = 0; i < size; i += 1) {
    dist[i][i] = 0;
    for (let j = i + 1; j < size; j += 1) {
      const leg = routeBetweenPoints(nodes[i], nodes[j]);
      const meters = leg?.distanceM ?? Infinity;
      dist[i][j] = meters;
      dist[j][i] = meters;
    }
  }

  const indexes = stops.map((_, index) => index + 1);
  const best: { order: number[] | null; meters: number } = { order: null, meters: Infinity };

  const consider = (order: number[]) => {
    let total = dist[0][order[0]];
    for (let i = 1; i < order.length; i += 1) total += dist[order[i - 1]][order[i]];
    if (total < best.meters) {
      best.meters = total;
      best.order = order.slice();
    }
  };

  if (indexes.length <= 8) {
    const walk = (start: number) => {
      if (start === indexes.length) {
        consider(indexes);
        return;
      }
      for (let i = start; i < indexes.length; i += 1) {
        [indexes[start], indexes[i]] = [indexes[i], indexes[start]];
        walk(start + 1);
        [indexes[start], indexes[i]] = [indexes[i], indexes[start]];
      }
    };
    walk(0);
  } else {
    const greedy = nearestStopOrder(dist);
    if (greedy.length === indexes.length) consider(improveStopOrder(dist, greedy));
  }

  if (!best.order || best.meters === Infinity) return null;
  return best.order.map((index) => stops[index - 1]);
}

function nearestStopOrder(dist: number[][]): number[] {
  const pending = new Set<number>();
  for (let index = 1; index < dist.length; index += 1) pending.add(index);
  const order: number[] = [];
  let current = 0;
  while (pending.size > 0) {
    let next = -1;
    let shortest = Infinity;
    for (const candidate of pending) {
      if (dist[current][candidate] < shortest) {
        shortest = dist[current][candidate];
        next = candidate;
      }
    }
    if (next < 0 || shortest === Infinity) break;
    order.push(next);
    pending.delete(next);
    current = next;
  }
  return order;
}

function improveStopOrder(dist: number[][], order: number[]): number[] {
  const path = order.slice();
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < path.length - 1; i += 1) {
      for (let k = i + 1; k < path.length; k += 1) {
        const before = i === 0 ? 0 : path[i - 1];
        const after = k + 1 < path.length ? path[k + 1] : null;
        const current =
          dist[before][path[i]] +
          (after == null ? 0 : dist[path[k]][after]);
        const swapped =
          dist[before][path[k]] +
          (after == null ? 0 : dist[path[i]][after]);
        if (swapped + 0.5 < current) {
          const segment = path.slice(i, k + 1).reverse();
          path.splice(i, segment.length, ...segment);
          improved = true;
        }
      }
    }
  }
  return path;
}

export function pointLetter(index: number): string {
  if (index >= 0 && index < 26) return String.fromCharCode(65 + index);
  return String(index + 1);
}

/**
 * Walks the campus graph through each point, in order.
 * `origin` is the selected start now, and the real GPS fix in production.
 * Without it, the first stop is the start.
 */
export function routeThroughPoints(
  stops: LatLng[],
  origin?: LatLng | null,
): HybridRouteResult | null {
  const points = origin ? [origin, ...stops] : stops;
  if (points.length < 2) return null;

  const coordinates: [number, number][] = [];
  const nodeIds: number[] = [];
  let distanceM = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const leg = routeBetweenPoints(points[index], points[index + 1]);
    if (!leg) return null;
    const merged = mergeCoordinates(coordinates, leg.coordinates);
    coordinates.length = 0;
    coordinates.push(...merged);
    distanceM += leg.distanceM;
    if (nodeIds.length === 0) nodeIds.push(...leg.nodeIds);
    else nodeIds.push(...leg.nodeIds.slice(1));
  }

  if (coordinates.length < 2) return null;

  return {
    nodeIds,
    coordinates,
    distanceM,
    origin: points[0],
    destination: points[points.length - 1],
    mode: "campus",
    durationS: null,
    entrance: null,
    drive: null,
    walk: null,
    parking: null,
    detail: null,
  };
}

function mergeCoordinates(
  a: [number, number][],
  b: [number, number][],
): [number, number][] {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = [...a];
  const last = out[out.length - 1];
  const startIndex =
    last[0] === b[0][0] && last[1] === b[0][1] ? 1 : 0;
  for (let i = startIndex; i < b.length; i += 1) {
    out.push(b[i]);
  }
  return out;
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}
