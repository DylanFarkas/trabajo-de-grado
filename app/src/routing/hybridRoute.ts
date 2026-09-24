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
