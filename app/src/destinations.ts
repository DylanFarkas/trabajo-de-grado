import {
  listCampusPlaces,
  placeInfo,
  type CampusCatalog,
  type CampusPlace,
} from "@/places";
import { listSpaces, spacePoint, type CatalogSpace } from "@/spaces";
import type { BuildingProperties, GeoJsonFeatureCollection, SpaceKind } from "@/types/campus";
import type { LatLng } from "@/routing/graph";

export type CampusDestination = {
  key: string;
  /** Id que ve el asistente. En edificios es el fid; en espacios, el id del GeoJSON. */
  catalogId: string | null;
  kind: "building" | "space";
  title: string;
  subtitle: string | null;
  /** Texto corto del buscador: código de edificio o etiqueta del espacio. */
  badge: string | null;
  /** Clave de `places` y de los aportes. */
  placeId: string | null;
  categories: string[];
  detail: string | null;
  point: LatLng;
  reachable: boolean;
  building: BuildingProperties | null;
  spaceId: string | null;
  spaceKind: SpaceKind | null;
};

const SPACE_KIND_LABELS: Record<SpaceKind, string> = {
  bano: "Baño",
  parqueadero: "Parqueadero",
  cancha: "Cancha",
};

export function spaceKindLabel(tipo: SpaceKind): string {
  return SPACE_KIND_LABELS[tipo];
}

function fromPlace(place: CampusPlace): CampusDestination {
  return {
    key: `building:${place.id}`,
    catalogId: place.id,
    kind: "building",
    title: place.title,
    subtitle: place.subtitle,
    badge: place.code,
    placeId: place.code,
    categories: place.categories,
    detail: place.detail,
    point: place.point,
    reachable: true,
    building: place.building,
    spaceId: null,
    spaceKind: null,
  };
}

function fromSpace(space: CatalogSpace): CampusDestination {
  const kindLabel = SPACE_KIND_LABELS[space.tipo];
  const subtitle = space.edificio ? `${kindLabel} · ${space.edificio}` : kindLabel;
  return {
    key: `space:${space.id}`,
    catalogId: space.id,
    kind: "space",
    title: space.title,
    subtitle,
    badge: space.etiqueta || space.id,
    placeId: space.id,
    categories: space.categories.length > 0 ? space.categories : [kindLabel],
    detail: space.notas,
    point: spacePoint(space.id) ?? space.coordinate,
    reachable: space.reachable,
    building: null,
    spaceId: space.id,
    spaceKind: space.tipo,
  };
}

export function listDestinations(
  collection: GeoJsonFeatureCollection,
  catalog?: CampusCatalog | null,
): CampusDestination[] {
  const items = [
    ...listCampusPlaces(collection, catalog).map(fromPlace),
    ...listSpaces(undefined, catalog).map(fromSpace),
  ];
  items.sort((a, b) => a.title.localeCompare(b.title, "es"));
  return items;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function searchDestinations(
  destinations: CampusDestination[],
  query: string,
  limit = 6,
): CampusDestination[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  return destinations
    .filter((item) => {
      const kindLabel = item.spaceKind ? SPACE_KIND_LABELS[item.spaceKind] : null;
      const haystack = normalize(
        [item.title, item.badge, item.placeId, item.subtitle, item.detail, kindLabel, ...item.categories]
          .filter(Boolean)
          .join(" "),
      );
      return haystack.includes(needle);
    })
    .slice(0, limit);
}

/** Resuelve el id del catálogo del asistente, el id de `places` o la etiqueta. */
export function findDestination(
  destinations: CampusDestination[],
  id: string | null | undefined,
): CampusDestination | null {
  if (!id) return null;
  const needle = id.trim().toLowerCase();
  if (!needle) return null;
  return (
    destinations.find((item) => item.catalogId?.toLowerCase() === needle) ??
    destinations.find(
      (item) => item.placeId?.toLowerCase() === needle || item.badge?.toLowerCase() === needle,
    ) ??
    null
  );
}

export function findDestinationByPlaceId(
  destinations: CampusDestination[],
  placeId: string,
): CampusDestination | null {
  return destinations.find((item) => item.placeId === placeId) ?? null;
}

/** Edificio tocado en el mapa. Si no está en la lista, arma uno con la ficha local. */
export function destinationFromBuilding(
  building: BuildingProperties,
  destinations: CampusDestination[],
  fallback: LatLng,
  catalog?: CampusCatalog | null,
): CampusDestination {
  const fid = building.fid != null ? String(building.fid) : null;
  const code = building["addr:housenumber"] ? String(building["addr:housenumber"]) : null;
  const found = destinations.find(
    (item) =>
      item.kind === "building" &&
      ((fid != null && item.catalogId === fid) || (code != null && item.placeId === code)),
  );
  if (found) return found;

  const info = placeInfo(building, catalog);
  return {
    key: `building:${fid ?? code ?? "punto"}`,
    catalogId: fid,
    kind: "building",
    title: info.title,
    subtitle: info.subtitle,
    badge: info.code,
    placeId: info.code,
    categories: info.categories,
    detail: info.detail,
    point: fallback,
    reachable: true,
    building,
    spaceId: null,
    spaceKind: null,
  };
}
