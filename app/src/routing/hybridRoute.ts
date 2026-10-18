import { CAMPUS_BOUNDS } from "@/constants/map";
import {
  CAMPUS_ENTRANCES,
  MOTORCYCLE_ENTRANCE,
  type CampusEntrance,
} from "@/constants/entrances";
import {
  motorcycleParking,
  nearestBikeParking,
  nearestDriveParking,
  nearestNodeId,
  nodeLatLng,
  parkingForPoint,
  routeBetweenPoints,
  siblingDoors,
  spacePoint,
  type LatLng,
  type RouteResult,
  type WalkCost,
} from "./graph";
import {
  fetchStreetRoute,
  haversineM,
  type StreetProfile,
  type StreetSource,
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
  /** Tramo en carro o en bici. Ausente cuando toda la ruta es a pie. */
  drive: RouteLeg | null;
  /** Tramo a pie de una ruta en carro o en bici. */
  walk: RouteLeg | null;
  /** Parqueadero donde se deja o se toma el carro, la bici o la moto. */
  parking: { name: string; point: LatLng } | null;
  /** Texto corto: "en carro hasta P6 · luego a pie". */
  detail: string | null;
  /** Quién armó el tramo de calle. Ausente si toda la ruta es del grafo. */
  streetSource?: StreetSource | null;
};

export class CampusRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampusRouteError";
  }
}

const ON_ROAD_M = 40;
const CAMPUS_DRIVE_MPS = 6;
const CAMPUS_BIKE_MPS = 4;
/** Velocidad en vías del campus al llegar en moto (misma red que el carro). */
const CAMPUS_MOTO_MPS = 6;

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
 * - origin off campus → OpenRouteService to the gate that best fits the destination (+ campus graph)
 * - both off campus → OpenRouteService direct
 *
 * La portería se elige sola (calle + tramo interno / parqueadero). No hay elección manual.
 *
 * @param walkCost solo el tramo a pie con los dos puntos dentro del campus. El resto sigue por metros.
 */
export async function routeHybrid(
  origin: LatLng,
  destination: LatLng,
  profile: StreetProfile = "foot-walking",
  walkCost: WalkCost = "short",
): Promise<HybridRouteResult | null> {
  if (profile === "driving-car") {
    return routeByCar(origin, destination);
  }
  if (profile === "cycling-regular") {
    return routeByBike(origin, destination);
  }
  if (profile === "driving-motorcycle") {
    return routeByMotorcycle(origin, destination);
  }

  const originInside = pointInCampus(origin);
  const destInside = pointInCampus(destination);

  if (originInside && destInside) {
    const campus = routeBetweenPoints(origin, destination, "walk", walkCost);
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
      streetSource: null,
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
      streetSource: street.source,
    };
  }

  // One side outside: outside → campus gate → inside dest (or reverse)
  if (!originInside && destInside) {
    const entrance = pickBestEntrance(origin, destination);
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
        streetSource: street.source,
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
        streetSource: street.source,
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
      streetSource: street.source,
    };
  }

  // origin inside, destination outside
  const entrance = pickBestEntrance(destination, origin);
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
      streetSource: street.source,
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
    streetSource: street.source,
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

/**
 * La puerta llega elegida según el origen, pero en carro, bici o moto la caminata
 * empieza en el parqueadero. Con varias puertas, gana la más cercana a su parqueadero.
 */
function doorNearestParking(destination: LatLng, walkFromParking: (door: LatLng) => number): LatLng {
  const doors = siblingDoors(destination);
  if (doors.length < 2) return destination;
  let best = destination;
  let bestM = walkFromParking(destination);
  for (const door of doors) {
    const meters = walkFromParking(door);
    if (meters < bestM) {
      best = door;
      bestM = meters;
    }
  }
  return best;
}

function walkFromDriveParking(door: LatLng): number {
  if (parkingForPoint(door)) return 0;
  return nearestDriveParking(door)?.distanceM ?? Infinity;
}

function walkFromBikeParking(door: LatLng): number {
  if (parkingForPoint(door, "parqueadero_bici")) return 0;
  return nearestBikeParking(door)?.distanceM ?? Infinity;
}

function walkFromMotoParking(door: LatLng): number {
  if (parkingForPoint(door, "parqueadero_moto")) return 0;
  const lot = motorcycleParking();
  const lotPoint = lot ? lotPointOf(lot.id) : null;
  if (!lot || !lotPoint) return Infinity;
  return routeBetweenPoints(lotPoint, door, "walk")?.distanceM ?? Infinity;
}

function motoParkingName(space: { etiqueta: string | null; nombre: string }): string {
  return space.etiqueta || space.nombre;
}

async function routeByCar(
  origin: LatLng,
  destination: LatLng,
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
      streetSource: street.source,
    };
  }

  if (destInside) {
    return routeCarTowardCampus(origin, destination, originInside);
  }
  return routeCarLeavingCampus(origin, destination);
}

async function routeCarTowardCampus(
  origin: LatLng,
  requested: LatLng,
  originInside: boolean,
): Promise<HybridRouteResult> {
  const destination = doorNearestParking(requested, walkFromDriveParking);
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
  let streetSource: StreetSource | null = null;
  const driveLines: [number, number][][] = [];
  if (!originInside) {
    entrance = pickDrivingGate(origin, lotPoint, true);
    if (!entrance) throw new CampusRouteError(NO_DRIVE);
    const street = await fetchStreetRoute(origin, entrance.point, "driving-car");
    streetMeters = street.distanceM;
    streetSeconds = street.durationS;
    streetSource = street.source;
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
    streetSource,
  };
}

async function routeCarLeavingCampus(
  origin: LatLng,
  destination: LatLng,
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

  const entrance = pickDrivingGate(destination, driveFrom, false);
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
    streetSource: street.source,
  };
}

const NO_BIKE_PARKING = "No hay un parqueadero de bicicletas cerca de ese destino";
const BIKE_PARKING_PREFIX = /^parqueadero de bicicletas\s+/i;

function bikeParkingName(space: { nombre: string }): string {
  return space.nombre.replace(BIKE_PARKING_PREFIX, "") || space.nombre;
}

/** Dentro del campus la bici va por la red peatonal: los parqueaderos de bicis cuelgan de senderos. */
async function routeByBike(
  origin: LatLng,
  destination: LatLng,
): Promise<HybridRouteResult> {
  const originInside = pointInCampus(origin);
  const destInside = pointInCampus(destination);

  if (!originInside && !destInside) {
    const street = await fetchStreetRoute(origin, destination, "cycling-regular");
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
      detail: "en bici",
      streetSource: street.source,
    };
  }

  if (destInside) {
    return routeBikeTowardCampus(origin, destination, originInside);
  }
  return routeBikeLeavingCampus(origin, destination);
}

async function routeBikeTowardCampus(
  origin: LatLng,
  requested: LatLng,
  originInside: boolean,
): Promise<HybridRouteResult> {
  const destination = doorNearestParking(requested, walkFromBikeParking);
  const atRack = parkingForPoint(destination, "parqueadero_bici");
  const rack = atRack ?? nearestBikeParking(destination);
  const rackPoint = rack ? lotPointOf(rack.id) : null;
  if (!rack || !rackPoint) throw new CampusRouteError(NO_BIKE_PARKING);

  const walkAfter = atRack ? null : routeBetweenPoints(rackPoint, destination, "walk");
  if (!atRack && !walkAfter) {
    throw new CampusRouteError(
      "No hay camino a pie desde el parqueadero de bicicletas hasta el destino",
    );
  }

  let entrance: CampusEntrance | null = null;
  let rideFrom = origin;
  let streetMeters = 0;
  let streetSeconds = 0;
  let streetSource: StreetSource | null = null;
  const rideLines: [number, number][][] = [];
  if (!originInside) {
    entrance = pickBestEntrance(origin, rackPoint);
    const street = await fetchStreetRoute(origin, entrance.point, "cycling-regular");
    streetMeters = street.distanceM;
    streetSeconds = street.durationS;
    streetSource = street.source;
    rideLines.push(street.coordinates);
    rideFrom = entrance.point;
  }

  const rideCampus = samePoint(rideFrom, rackPoint)
    ? null
    : routeBetweenPoints(rideFrom, rackPoint, "walk");
  if (!samePoint(rideFrom, rackPoint) && !rideCampus) {
    throw new CampusRouteError("No hay camino en bici hasta ese parqueadero de bicicletas");
  }
  if (rideCampus && rideCampus.coordinates.length >= 2) rideLines.push(rideCampus.coordinates);

  const walkLines =
    walkAfter && walkAfter.coordinates.length >= 2 ? [walkAfter.coordinates] : [];
  const rideM = streetMeters + (rideCampus?.distanceM ?? 0);
  const walkM = walkAfter?.distanceM ?? 0;
  const coordinates = rideLines.concat(walkLines).reduce(mergeCoordinates, [] as [number, number][]);
  const rackLabel = bikeParkingName(rack);
  const rode = rideM >= 1;
  const parts = [
    rode ? (atRack ? "en bici" : `en bici hasta ${rackLabel}`) : null,
    walkAfter ? (rode ? "luego a pie" : "a pie") : null,
  ].filter(Boolean);

  return {
    nodeIds: rideCampus?.nodeIds ?? [],
    coordinates,
    distanceM: rideM + walkM,
    origin,
    destination,
    mode: walkLines.length || entrance ? "hybrid" : "campus",
    durationS:
      streetSeconds + (rideCampus?.distanceM ?? 0) / CAMPUS_BIKE_MPS + walkM / 1.4,
    entrance,
    drive: rideLines.length ? { lines: rideLines, distanceM: rideM } : null,
    walk: walkLines.length ? { lines: walkLines, distanceM: walkM } : null,
    parking: atRack ? null : { name: rackLabel, point: rackPoint },
    detail: parts.join(" · ") || null,
    streetSource,
  };
}

/** Quien sale en bici se la lleva: no hay parqueadero en este sentido. */
async function routeBikeLeavingCampus(
  origin: LatLng,
  destination: LatLng,
): Promise<HybridRouteResult> {
  const entrance = pickBestEntrance(destination, origin);
  const rideCampus = samePoint(origin, entrance.point)
    ? null
    : routeBetweenPoints(origin, entrance.point, "walk");
  if (!samePoint(origin, entrance.point) && !rideCampus) {
    throw new CampusRouteError("No hay camino en bici hasta esa portería");
  }
  const street = await fetchStreetRoute(entrance.point, destination, "cycling-regular");

  const rideLines: [number, number][][] = [];
  if (rideCampus && rideCampus.coordinates.length >= 2) rideLines.push(rideCampus.coordinates);
  if (street.coordinates.length >= 2) rideLines.push(street.coordinates);
  const rideM = (rideCampus?.distanceM ?? 0) + street.distanceM;

  return {
    nodeIds: rideCampus?.nodeIds ?? [],
    coordinates: rideLines.reduce(mergeCoordinates, [] as [number, number][]),
    distanceM: rideM,
    origin,
    destination,
    mode: "hybrid",
    durationS: street.durationS + (rideCampus?.distanceM ?? 0) / CAMPUS_BIKE_MPS,
    entrance,
    drive: { lines: rideLines, distanceM: rideM },
    walk: null,
    parking: null,
    detail: "en bici",
    streetSource: street.source,
  };
}

const NO_MOTO_PARKING = "No está disponible el parqueadero de motos P14";
const MOTO_ONLY_ARRIVAL =
  "En moto solo se puede llegar a la universidad; dentro del campus se debe ir a pie";

/**
 * Solo llegada al campus: calle directo al acceso de P14, luego a pie.
 * No usa las porterías ni las vías internas: la moto no circula dentro.
 */
async function routeByMotorcycle(
  origin: LatLng,
  destination: LatLng,
): Promise<HybridRouteResult> {
  const originInside = pointInCampus(origin);
  const destInside = pointInCampus(destination);

  if (originInside) throw new CampusRouteError(MOTO_ONLY_ARRIVAL);
  if (!destInside) {
    throw new CampusRouteError("En moto solo se puede llegar a un destino dentro del campus");
  }

  const requested = doorNearestParking(destination, walkFromMotoParking);
  const atLot = parkingForPoint(requested, "parqueadero_moto");
  const lot = atLot ?? motorcycleParking();
  const lotPoint = lot ? lotPointOf(lot.id) : null;
  if (!lot || !lotPoint) throw new CampusRouteError(NO_MOTO_PARKING);

  const walkAfter = atLot ? null : routeBetweenPoints(lotPoint, requested, "walk");
  if (!atLot && !walkAfter) {
    throw new CampusRouteError("No hay camino a pie desde el parqueadero de motos hasta el destino");
  }

  const entrance = MOTORCYCLE_ENTRANCE;
  const street = await fetchStreetRoute(origin, entrance.point, "driving-motorcycle");
  const streetEnd = street.coordinates[street.coordinates.length - 1];
  const lotCoord: [number, number] = [lotPoint.longitude, lotPoint.latitude];
  const intoLot =
    streetEnd && (streetEnd[0] !== lotCoord[0] || streetEnd[1] !== lotCoord[1])
      ? haversineM(
          { longitude: streetEnd[0], latitude: streetEnd[1] },
          lotPoint,
        )
      : 0;

  const driveLines: [number, number][][] = [];
  if (street.coordinates.length >= 2) driveLines.push(street.coordinates);
  if (intoLot > 1 && streetEnd) driveLines.push([streetEnd, lotCoord]);

  const walkLines =
    walkAfter && walkAfter.coordinates.length >= 2 ? [walkAfter.coordinates] : [];
  const driveM = street.distanceM + intoLot;
  const walkM = walkAfter?.distanceM ?? 0;
  const coordinates = driveLines.concat(walkLines).reduce(mergeCoordinates, [] as [number, number][]);
  const lotLabel = motoParkingName(lot);
  const parts = [
    atLot ? "en moto" : `en moto hasta ${lotLabel}`,
    walkAfter ? "luego a pie" : null,
  ].filter(Boolean);

  return {
    nodeIds: [],
    coordinates,
    distanceM: driveM + walkM,
    origin,
    destination: requested,
    mode: "hybrid",
    durationS: street.durationS + intoLot / CAMPUS_MOTO_MPS + walkM / 1.4,
    entrance,
    drive: driveLines.length ? { lines: driveLines, distanceM: driveM } : null,
    walk: walkLines.length ? { lines: walkLines, distanceM: walkM } : null,
    parking: atLot ? null : { name: lotLabel, point: lotPoint },
    detail: parts.join(" · ") || null,
    streetSource: street.source,
  };
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
