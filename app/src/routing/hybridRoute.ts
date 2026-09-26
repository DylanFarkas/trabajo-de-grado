import { CAMPUS_BOUNDS } from "@/constants/map";
import {
  CAMPUS_ENTRANCES,
  type CampusEntrance,
} from "@/constants/entrances";
import {
  routeBetweenPoints,
  type LatLng,
  type RouteResult,
} from "./graph";
import {
  fetchStreetRoute,
  haversineM,
  type StreetProfile,
} from "./openRouteService";

export type HybridRouteResult = RouteResult & {
  mode: "campus" | "street" | "hybrid";
  durationS: number | null;
  entrance: CampusEntrance | null;
  profile?: StreetProfile;
};

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
