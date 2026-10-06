import nodosJson from "@/assets/geojson/nodos.json";
import aristasJson from "@/assets/geojson/aristas_red.json";
import pasillosJson from "@/assets/geojson/pasillos.json";
import entradasJson from "@/assets/geojson/entradas.json";
import espaciosJson from "@/assets/geojson/espacios.json";
import type {
  GeoJsonFeatureCollection,
  GeoJsonPosition,
  SpaceFeatureCollection,
  SpaceKind,
} from "@/types/campus";

export type LatLng = { latitude: number; longitude: number };

export type RouteResult = {
  nodeIds: number[];
  coordinates: [number, number][]; // [lon, lat]
  distanceM: number;
  origin: LatLng;
  destination: LatLng;
};

type GraphEdge = {
  to: number;
  weight: number;
  /** Coordinates from parent -> to as [lon, lat] */
  coords: [number, number][];
  /** Calle o vía interna. Los senderos y pasillos quedan en false. */
  vehicle: boolean;
};

type GraphNode = {
  id: number;
  longitude: number;
  latitude: number;
};

type RawEdge = {
  from: number;
  to: number;
  weight: number;
  coords: [number, number][];
  oneway: boolean;
  vehicle: boolean;
};

export type RouteMode = "walk" | "drive";

const VEHICLE_HIGHWAYS = new Set([
  "service",
  "tertiary",
  "tertiary_link",
  "secondary",
  "primary",
  "primary_link",
]);

/** Un parqueadero enganchado a un sendero también se conecta a la vía si queda a esta distancia. */
const PARKING_DRIVE_SNAP_M = 40;

function isVehicleHighway(props: { highway?: unknown; access?: unknown }): boolean {
  const highway = props.highway;
  if (typeof highway !== "string" || !VEHICLE_HIGHWAYS.has(highway)) return false;
  return props.access !== "no";
}

function nodeTouchesVehicle(raw: RawEdge[], id: number): boolean {
  return raw.some((edge) => edge.vehicle && (edge.from === id || edge.to === id));
}

/** Join an existing node if the drawn end is already on it. */
const SNAP_NODE_M = 4;
/** Otherwise split the nearest path, if the drawn end lands on it. */
const SNAP_EDGE_M = 12;

function asLonLat(pos: GeoJsonPosition): [number, number] {
  return [pos[0], pos[1]];
}

function lineCoords(geometry: {
  type: string;
  coordinates: unknown;
}): [number, number][] {
  if (geometry.type === "LineString") {
    return (geometry.coordinates as GeoJsonPosition[]).map(asLonLat);
  }
  if (geometry.type === "MultiLineString") {
    const parts = geometry.coordinates as GeoJsonPosition[][];
    const out: [number, number][] = [];
    for (const part of parts) {
      for (const p of part) {
        const ll = asLonLat(p);
        const last = out[out.length - 1];
        if (!last || last[0] !== ll[0] || last[1] !== ll[1]) out.push(ll);
      }
    }
    return out;
  }
  return [];
}

function isOneway(value: unknown): boolean {
  return value === "yes" || value === "1" || value === 1 || value === true;
}

function dedupeCoords(coords: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of coords) {
    const last = out[out.length - 1];
    if (!last || last[0] !== c[0] || last[1] !== c[1]) out.push(c);
  }
  return out;
}

function chainLengthM(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(
      { longitude: coords[i - 1][0], latitude: coords[i - 1][1] },
      { longitude: coords[i][0], latitude: coords[i][1] },
    );
  }
  return total;
}

function closestOnSegment(
  point: [number, number],
  a: [number, number],
  b: [number, number],
): { t: number; point: [number, number]; distanceM: number } {
  const lat = (point[1] * Math.PI) / 180;
  const kx = 111320 * Math.cos(lat);
  const ky = 110540;
  const bx = (b[0] - a[0]) * kx;
  const by = (b[1] - a[1]) * ky;
  const px = (point[0] - a[0]) * kx;
  const py = (point[1] - a[1]) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  const snapped: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return {
    t,
    point: snapped,
    distanceM: haversineM(
      { longitude: point[0], latitude: point[1] },
      { longitude: snapped[0], latitude: snapped[1] },
    ),
  };
}

function splitRawEdge(
  raw: RawEdge[],
  nodes: Map<number, GraphNode>,
  edgeIndex: number,
  segIndex: number,
  t: number,
  nextId: { value: number },
): number {
  const edge = raw[edgeIndex];
  const a = edge.coords[segIndex];
  const b = edge.coords[segIndex + 1];
  const point: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const leftCoords = dedupeCoords(edge.coords.slice(0, segIndex + 1).concat([point]));
  const rightCoords = dedupeCoords([point].concat(edge.coords.slice(segIndex + 1)));
  const leftLen = chainLengthM(leftCoords);
  const rightLen = chainLengthM(rightCoords);
  if (leftCoords.length < 2 || leftLen < 0.4) return edge.from;
  if (rightCoords.length < 2 || rightLen < 0.4) return edge.to;

  const id = nextId.value++;
  nodes.set(id, { id, longitude: point[0], latitude: point[1] });
  const sum = leftLen + rightLen;
  raw.splice(
    edgeIndex,
    1,
    {
      from: edge.from,
      to: id,
      weight: edge.weight * (leftLen / sum),
      coords: leftCoords,
      oneway: edge.oneway,
      vehicle: edge.vehicle,
    },
    {
      from: id,
      to: edge.to,
      weight: edge.weight * (rightLen / sum),
      coords: rightCoords,
      oneway: edge.oneway,
      vehicle: edge.vehicle,
    },
  );
  return id;
}

function snapEndpoint(
  point: [number, number],
  nodes: Map<number, GraphNode>,
  raw: RawEdge[],
  nextId: { value: number },
  edgeOnly = false,
  vehicleOnly = false,
  maxEdgeM = SNAP_EDGE_M,
): number | null {
  if (!edgeOnly) {
    let bestNode: number | null = null;
    let bestNodeD = Infinity;
    for (const node of nodes.values()) {
      if (vehicleOnly && !nodeTouchesVehicle(raw, node.id)) continue;
      const d = haversineM(
        { longitude: point[0], latitude: point[1] },
        { longitude: node.longitude, latitude: node.latitude },
      );
      if (d < bestNodeD) {
        bestNodeD = d;
        bestNode = node.id;
      }
    }
    if (bestNode != null && bestNodeD <= SNAP_NODE_M) return bestNode;
  }

  let best: {
    edgeIndex: number;
    segIndex: number;
    t: number;
    distanceM: number;
  } | null = null;
  for (let edgeIndex = 0; edgeIndex < raw.length; edgeIndex++) {
    if (vehicleOnly && !raw[edgeIndex].vehicle) continue;
    const coords = raw[edgeIndex].coords;
    for (let segIndex = 0; segIndex < coords.length - 1; segIndex++) {
      const hit = closestOnSegment(point, coords[segIndex], coords[segIndex + 1]);
      if (!best || hit.distanceM < best.distanceM) {
        best = { edgeIndex, segIndex, t: hit.t, distanceM: hit.distanceM };
      }
    }
  }
  if (!best || best.distanceM > maxEdgeM) return null;
  return splitRawEdge(raw, nodes, best.edgeIndex, best.segIndex, best.t, nextId);
}

/** Building code -> graph nodes created at each door. */
const ENTRANCE_NODES = new Map<string, number[]>();

function buildingCode(value: unknown): string | null {
  if (value == null || value === "") return null;
  const code = String(value).trim().toUpperCase();
  return code || null;
}

/**
 * Doors are points, not corridors. Each one is cut into the nearest path
 * so a route can end at the entrance instead of the nearest junction.
 */
function spliceEntrances(nodes: Map<number, GraphNode>, raw: RawEdge[]) {
  ENTRANCE_NODES.clear();
  const entrances = entradasJson as unknown as GeoJsonFeatureCollection;
  let maxId = 0;
  for (const id of nodes.keys()) maxId = Math.max(maxId, id);
  const nextId = { value: maxId + 1 };

  for (const feature of entrances.features ?? []) {
    if (!feature.geometry || feature.geometry.type !== "Point") continue;
    const code = buildingCode(feature.properties?.edificio);
    if (!code) continue;
    const point = asLonLat(feature.geometry.coordinates as GeoJsonPosition);
    const snappedId = snapEndpoint(point, nodes, raw, nextId, true);
    const snapped = snappedId == null ? undefined : nodes.get(snappedId);
    if (snappedId == null || !snapped) continue;

    const gap = haversineM(
      { longitude: point[0], latitude: point[1] },
      { longitude: snapped.longitude, latitude: snapped.latitude },
    );
    let doorId = snappedId;
    if (gap > 0.4) {
      doorId = nextId.value++;
      nodes.set(doorId, { id: doorId, longitude: point[0], latitude: point[1] });
      raw.push({
        from: snappedId,
        to: doorId,
        weight: gap,
        coords: [
          [snapped.longitude, snapped.latitude],
          [point[0], point[1]],
        ],
        oneway: false,
        vehicle: nodeTouchesVehicle(raw, snappedId),
      });
    }

    const list = ENTRANCE_NODES.get(code) ?? [];
    list.push(doorId);
    ENTRANCE_NODES.set(code, list);
  }
}

/** Hand-drawn indoor corridors. Endpoints snap onto the existing path network. */
function splicePassages(nodes: Map<number, GraphNode>, raw: RawEdge[]) {
  const passages = pasillosJson as unknown as GeoJsonFeatureCollection;
  let maxId = 0;
  for (const id of nodes.keys()) maxId = Math.max(maxId, id);
  const nextId = { value: maxId + 1 };

  for (const feature of passages.features ?? []) {
    if (!feature.geometry) continue;
    const coords = lineCoords(feature.geometry);
    if (coords.length < 2) continue;

    const startId = snapEndpoint(coords[0], nodes, raw, nextId);
    const endId = snapEndpoint(coords[coords.length - 1], nodes, raw, nextId);
    if (startId == null || endId == null || startId === endId) continue;

    const start = nodes.get(startId);
    const end = nodes.get(endId);
    if (!start || !end) continue;

    const line = dedupeCoords([
      [start.longitude, start.latitude],
      ...coords.slice(1, -1),
      [end.longitude, end.latitude],
    ]);
    if (line.length < 2) continue;

    const stated = Number(feature.properties?.longitud_m);
    raw.push({
      from: startId,
      to: endId,
      weight: stated > 0 ? stated : chainLengthM(line),
      coords: line,
      oneway: isOneway(feature.properties?.oneway),
      vehicle: false,
    });
  }
}

const SPACE_KINDS = new Set<SpaceKind>(["bano", "parqueadero", "cancha"]);
const SPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

type SpaceNode = {
  id: string;
  nombre: string;
  tipo: SpaceKind;
  edificio: string | null;
  notas: string | null;
  etiqueta: string | null;
  coordinate: LatLng;
  nodeId: number | null;
};

/** Filled while the graph is built. `nodeId` is the point a route can end on. */
const SPACE_LIST: SpaceNode[] = [];

export type CampusSpace = {
  id: string;
  nombre: string;
  tipo: SpaceKind;
  edificio: string | null;
  notas: string | null;
  etiqueta: string | null;
  /** Punto definido en el GeoJSON. */
  coordinate: LatLng;
  /** Tiene un nodo en el grafo, así que se puede rutear hasta ahí. */
  reachable: boolean;
};

function isSpaceKind(value: unknown): value is SpaceKind {
  return typeof value === "string" && SPACE_KINDS.has(value as SpaceKind);
}

function ringCentroid(ring: GeoJsonPosition[]): [number, number] | null {
  if (ring.length < 4) return null;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0];
    const y1 = ring[i][1];
    const x2 = ring[i + 1][0];
    const y2 = ring[i + 1][1];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-14) return null;
  return [cx / (3 * area), cy / (3 * area)];
}

function spaceAnchor(feature: SpaceFeatureCollection["features"][number]): [number, number] | null {
  const centro = feature.properties?.centro;
  if (Array.isArray(centro) && centro.length >= 2) {
    const longitude = Number(centro[0]);
    const latitude = Number(centro[1]);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return [longitude, latitude];
  }
  const geometry = feature.geometry;
  if (!geometry) return null;
  if (geometry.type === "Point") return asLonLat(geometry.coordinates);
  if (geometry.type === "Polygon") return ringCentroid(geometry.coordinates[0] ?? []);
  if (geometry.type === "MultiPolygon") return ringCentroid(geometry.coordinates[0]?.[0] ?? []);
  return null;
}

function textOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Custom spaces are points (or the center of an area), not corridors.
 * Each one is cut into the nearest path. Indoors, with no path nearby,
 * the route ends at the building door.
 */
function spliceSpaces(nodes: Map<number, GraphNode>, raw: RawEdge[]) {
  SPACE_LIST.length = 0;
  const spaces = espaciosJson as unknown as SpaceFeatureCollection;
  let maxId = 0;
  for (const id of nodes.keys()) maxId = Math.max(maxId, id);
  const nextId = { value: maxId + 1 };
  const seen = new Set<string>();

  for (const feature of spaces.features ?? []) {
    const props = feature.properties;
    const id = textOrNull(props?.id);
    const nombre = textOrNull(props?.nombre);
    if (!id || !SPACE_ID.test(id) || !nombre || !isSpaceKind(props?.tipo) || seen.has(id)) continue;
    const anchor = spaceAnchor(feature);
    if (!anchor) continue;
    seen.add(id);

    const edificio = buildingCode(props.edificio);
    let snappedId = snapEndpoint(anchor, nodes, raw, nextId, true);
    if (snappedId == null && edificio) {
      snappedId = ENTRANCE_NODES.get(edificio)?.[0] ?? null;
    }

    let nodeId: number | null = null;
    if (snappedId != null) {
      const snapped = nodes.get(snappedId);
      nodeId = snappedId;
      if (snapped) {
        const gap = haversineM(
          { longitude: anchor[0], latitude: anchor[1] },
          { longitude: snapped.longitude, latitude: snapped.latitude },
        );
        if (gap > 0.4) {
          nodeId = nextId.value++;
          nodes.set(nodeId, { id: nodeId, longitude: anchor[0], latitude: anchor[1] });
          raw.push({
            from: snappedId,
            to: nodeId,
            weight: gap,
            coords: [
              [snapped.longitude, snapped.latitude],
              [anchor[0], anchor[1]],
            ],
            oneway: false,
            vehicle: nodeTouchesVehicle(raw, snappedId),
          });
        }
      }
    }

    if (
      props.tipo === "parqueadero" &&
      nodeId != null &&
      !nodeTouchesVehicle(raw, nodeId)
    ) {
      const driveId = snapEndpoint(anchor, nodes, raw, nextId, true, true, PARKING_DRIVE_SNAP_M);
      const driveNode = driveId == null ? undefined : nodes.get(driveId);
      const parkNode = nodes.get(nodeId);
      if (driveId != null && driveId !== nodeId && driveNode && parkNode) {
        const gap = haversineM(
          { longitude: parkNode.longitude, latitude: parkNode.latitude },
          { longitude: driveNode.longitude, latitude: driveNode.latitude },
        );
        if (gap > 0.4) {
          raw.push({
            from: driveId,
            to: nodeId,
            weight: gap,
            coords: [
              [driveNode.longitude, driveNode.latitude],
              [parkNode.longitude, parkNode.latitude],
            ],
            oneway: false,
            vehicle: true,
          });
        }
      }
    }

    SPACE_LIST.push({
      id,
      nombre,
      tipo: props.tipo,
      edificio,
      notas: textOrNull(props.notas),
      etiqueta: textOrNull(props.etiqueta),
      coordinate: { longitude: anchor[0], latitude: anchor[1] },
      nodeId,
    });
  }
}

function toCampusSpace(space: SpaceNode): CampusSpace {
  return {
    id: space.id,
    nombre: space.nombre,
    tipo: space.tipo,
    edificio: space.edificio,
    notas: space.notas,
    etiqueta: space.etiqueta,
    coordinate: space.coordinate,
    reachable: space.nodeId != null,
  };
}

function buildCampusGraph() {
  const nodesFc = nodosJson as unknown as GeoJsonFeatureCollection;
  const edgesFc = aristasJson as unknown as GeoJsonFeatureCollection;

  const nodes = new Map<number, GraphNode>();
  for (const feature of nodesFc.features) {
    const id = Number(feature.properties?.id_nodo);
    if (!feature.geometry || feature.geometry.type !== "Point" || Number.isNaN(id)) {
      continue;
    }
    const [longitude, latitude] = asLonLat(feature.geometry.coordinates);
    nodes.set(id, { id, longitude, latitude });
  }

  const raw: RawEdge[] = [];
  for (const feature of edgesFc.features) {
    const props = feature.properties ?? {};
    const from = Number(props.id_nodo);
    const to = Number(props.fin_id_nodo);
    const weight = Number(props.longitud_m);
    if (!feature.geometry || Number.isNaN(from) || Number.isNaN(to) || !(weight > 0)) {
      continue;
    }
    if (!nodes.has(from) || !nodes.has(to)) continue;
    const coords = lineCoords(feature.geometry);
    if (coords.length < 2) continue;
    raw.push({
      from,
      to,
      weight,
      coords,
      oneway: isOneway(props.oneway),
      vehicle: isVehicleHighway(props),
    });
  }

  splicePassages(nodes, raw);
  spliceEntrances(nodes, raw);
  spliceSpaces(nodes, raw);

  const adj = new Map<number, GraphEdge[]>();
  const ensure = (id: number) => {
    if (!adj.has(id)) adj.set(id, []);
  };

  for (const edge of raw) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || !(edge.weight > 0)) continue;
    ensure(edge.from);
    ensure(edge.to);
    adj.get(edge.from)!.push({
      to: edge.to,
      weight: edge.weight,
      coords: edge.coords,
      vehicle: edge.vehicle,
    });
    if (!edge.oneway) {
      adj.get(edge.to)!.push({
        to: edge.from,
        weight: edge.weight,
        coords: [...edge.coords].reverse(),
        vehicle: edge.vehicle,
      });
    }
  }

  const driveNodes = new Set<number>();
  for (const [from, edges] of adj) {
    for (const edge of edges) {
      if (!edge.vehicle) continue;
      driveNodes.add(from);
      driveNodes.add(edge.to);
    }
  }

  return { nodes, adj, driveNodes };
}

const GRAPH = buildCampusGraph();

function haversineM(a: LatLng, b: LatLng): number {
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

export function nearestNodeId(point: LatLng, mode: RouteMode = "walk"): number | null {
  let bestId: number | null = null;
  let best = Infinity;
  for (const node of GRAPH.nodes.values()) {
    if (mode === "drive" && !GRAPH.driveNodes.has(node.id)) continue;
    const d = haversineM(point, {
      latitude: node.latitude,
      longitude: node.longitude,
    });
    if (d < best) {
      best = d;
      bestId = node.id;
    }
  }
  return bestId;
}

export function nodeLatLng(id: number): LatLng | null {
  const node = GRAPH.nodes.get(id);
  if (!node) return null;
  return { latitude: node.latitude, longitude: node.longitude };
}

/** Dijkstra shortest path by longitud_m. En carro solo recorre vías. */
export function shortestPath(
  originId: number,
  destinationId: number,
  mode: RouteMode = "walk",
): RouteResult | null {
  if (originId === destinationId) {
    const p = nodeLatLng(originId);
    if (!p) return null;
    return {
      nodeIds: [originId],
      coordinates: [[p.longitude, p.latitude]],
      distanceM: 0,
      origin: p,
      destination: p,
    };
  }

  const dist = new Map<number, number>();
  const prev = new Map<number, { from: number; edge: GraphEdge }>();
  const visited = new Set<number>();

  for (const id of GRAPH.nodes.keys()) dist.set(id, Infinity);
  dist.set(originId, 0);

  while (visited.size < GRAPH.nodes.size) {
    let u: number | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u == null || best === Infinity) break;
    if (u === destinationId) break;
    visited.add(u);

    const edges = GRAPH.adj.get(u) ?? [];
    for (const edge of edges) {
      if (mode === "drive" && !edge.vehicle) continue;
      if (visited.has(edge.to)) continue;
      const nd = best + edge.weight;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, { from: u, edge });
      }
    }
  }

  if ((dist.get(destinationId) ?? Infinity) === Infinity) return null;

  const nodeIds: number[] = [];
  const edgeChain: GraphEdge[] = [];
  let cur: number | undefined = destinationId;
  while (cur != null && cur !== originId) {
    nodeIds.push(cur);
    const step = prev.get(cur);
    if (!step) return null;
    edgeChain.push(step.edge);
    cur = step.from;
  }
  nodeIds.push(originId);
  nodeIds.reverse();
  edgeChain.reverse();

  const coordinates: [number, number][] = [];
  for (const edge of edgeChain) {
    for (const c of edge.coords) {
      const last = coordinates[coordinates.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) coordinates.push(c);
    }
  }

  const origin = nodeLatLng(originId);
  const destination = nodeLatLng(destinationId);
  if (!origin || !destination || coordinates.length < 2) return null;

  return {
    nodeIds,
    coordinates,
    distanceM: dist.get(destinationId) ?? 0,
    origin,
    destination,
  };
}

/**
 * Point on the walkway in front of a building door.
 * With several doors and a known other endpoint, picks the shortest walk.
 */
export function entrancePoint(
  code: string | null | undefined,
  toward?: LatLng | null,
): LatLng | null {
  const key = buildingCode(code);
  if (!key) return null;
  const ids = ENTRANCE_NODES.get(key);
  if (!ids?.length) return null;
  if (ids.length === 1 || !toward) return nodeLatLng(ids[0]);

  const fromId = nearestNodeId(toward);
  if (fromId == null) return nodeLatLng(ids[0]);

  let bestId = ids[0];
  let best = Infinity;
  for (const id of ids) {
    if (id === fromId) return nodeLatLng(id);
    const path = shortestPath(fromId, id);
    const distance = path?.distanceM ?? Infinity;
    if (distance < best) {
      best = distance;
      bestId = id;
    }
  }
  return nodeLatLng(bestId);
}

export function routeBetweenPoints(
  origin: LatLng,
  destination: LatLng,
  mode: RouteMode = "walk",
): RouteResult | null {
  const a = nearestNodeId(origin, mode);
  const b = nearestNodeId(destination, mode);
  if (a == null || b == null) return null;
  return shortestPath(a, b, mode);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function listSpaces(tipo?: SpaceKind): CampusSpace[] {
  return SPACE_LIST.filter((space) => tipo == null || space.tipo === tipo).map(toCampusSpace);
}

/** Nodo enganchado al camino. `null` si el espacio no tiene ruta. */
export function spacePoint(id: string): LatLng | null {
  const space = SPACE_LIST.find((item) => item.id === id);
  if (!space?.nodeId) return null;
  return nodeLatLng(space.nodeId);
}

function walkDistances(originId: number): Map<number, number> {
  const dist = new Map<number, number>();
  const visited = new Set<number>();
  for (const id of GRAPH.nodes.keys()) dist.set(id, Infinity);
  dist.set(originId, 0);

  while (visited.size < GRAPH.nodes.size) {
    let current: number | null = null;
    let best = Infinity;
    for (const [id, distance] of dist) {
      if (!visited.has(id) && distance < best) {
        best = distance;
        current = id;
      }
    }
    if (current == null || best === Infinity) break;
    visited.add(current);
    for (const edge of GRAPH.adj.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      const next = best + edge.weight;
      if (next < (dist.get(edge.to) ?? Infinity)) dist.set(edge.to, next);
    }
  }
  return dist;
}

/** Espacio de ese tipo con menor caminata desde el origen. */
export function nearestSpace(
  origin: LatLng,
  tipo: SpaceKind,
): (CampusSpace & { distanceM: number }) | null {
  const originId = nearestNodeId(origin);
  if (originId == null) return null;
  const distances = walkDistances(originId);
  let best: SpaceNode | null = null;
  let bestDistance = Infinity;
  for (const space of SPACE_LIST) {
    if (space.tipo !== tipo || space.nodeId == null) continue;
    const distance = distances.get(space.nodeId) ?? Infinity;
    if (distance < bestDistance) {
      best = space;
      bestDistance = distance;
    }
  }
  if (!best || bestDistance === Infinity) return null;
  return { ...toCampusSpace(best), distanceM: bestDistance };
}

/** El punto cae en el nodo de un parqueadero. */
export function parkingForPoint(point: LatLng): CampusSpace | null {
  const id = nearestNodeId(point);
  if (id == null) return null;
  const space = SPACE_LIST.find((item) => item.tipo === "parqueadero" && item.nodeId === id);
  if (!space?.nodeId) return null;
  const node = nodeLatLng(space.nodeId);
  if (!node || haversineM(point, node) > 30) return null;
  return toCampusSpace(space);
}

/** Parqueadero alcanzable en carro con menor caminata hasta el destino. */
export function nearestDriveParking(
  destination: LatLng,
): (CampusSpace & { distanceM: number }) | null {
  const destinationId = nearestNodeId(destination);
  if (destinationId == null) return null;
  let best: SpaceNode | null = null;
  let bestDistance = Infinity;
  for (const space of SPACE_LIST) {
    if (space.tipo !== "parqueadero" || space.nodeId == null) continue;
    if (!GRAPH.driveNodes.has(space.nodeId)) continue;
    const distance =
      space.nodeId === destinationId
        ? 0
        : (shortestPath(space.nodeId, destinationId, "walk")?.distanceM ?? Infinity);
    if (distance < bestDistance) {
      best = space;
      bestDistance = distance;
    }
  }
  if (!best || bestDistance === Infinity) return null;
  return { ...toCampusSpace(best), distanceM: bestDistance };
}
