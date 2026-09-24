import { entrancePoint, type LatLng } from "@/routing/graph";
import type {
  BuildingProperties,
  GeoJsonFeatureCollection,
  GeoJsonGeometry,
  GeoJsonPosition,
} from "@/types/campus";

// const METERS_PER_FLOOR = 3.2; // usado al restaurar detalle de pisos/altura

const AMENITY_LABELS: Record<string, string> = {
  library: "Biblioteca",
  restaurant: "Comida",
  cafe: "Café",
  theatre: "Teatro",
  toilets: "Baños",
  parking: "Parqueadero",
  sports_centre: "Deporte",
};

export type PlaceInfo = {
  title: string;
  subtitle: string | null;
  code: string | null;
  categories: string[];
  detail: string | null;
};

export type CatalogTone = "food" | "sport" | "library" | "culture" | "academic";

export type PlaceRecord = {
  name: string;
  description: string | null;
};

export type CategoryRecord = {
  id: string;
  name: string;
  tone: CatalogTone;
  sortOrder: number;
};

export type CampusCatalog = {
  places: Record<string, PlaceRecord>;
  categories: Record<string, CategoryRecord>;
  assignments: Record<string, string[]>;
};

const MAP_TONES = new Set<CatalogTone>(["food", "sport", "library", "culture"]);

export function categoriesForCode(
  code: string | null,
  catalog: CampusCatalog | null | undefined,
): CategoryRecord[] {
  if (!code || !catalog) return [];
  return (catalog.assignments[code] ?? [])
    .map((id) => catalog.categories[id])
    .filter((category): category is CategoryRecord => category != null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
}

export function catalogMapTone(
  code: string | null,
  catalog: CampusCatalog | null | undefined,
): CatalogTone | null {
  return categoriesForCode(code, catalog).find((category) => MAP_TONES.has(category.tone))?.tone ?? null;
}

export type CampusPlace = PlaceInfo & {
  id: string;
  point: LatLng;
  building: BuildingProperties;
};

export function floorsOf(props: BuildingProperties | null | undefined): number {
  const levels = props?.["building:levels"];
  if (levels != null && levels !== "") {
    const n = Number(levels);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  if (props?.altura != null && props.altura > 0) return props.altura;
  return 1;
}

export function placeInfo(
  props: BuildingProperties | null | undefined,
  catalog?: CampusCatalog | null,
): PlaceInfo {
  if (!props) {
    return {
      title: "Punto en el mapa",
      subtitle: "Se ajustará al camino más cercano",
      code: null,
      categories: [],
      detail: null,
    };
  }

  const localName = props["addr:housename"] || props.name;
  const code = props["addr:housenumber"] ? String(props["addr:housenumber"]) : null;
  const remote = code && catalog?.places[code] ? catalog.places[code] : null;
  const name = remote?.name || localName;
  const title = name || (code ? `Edificio ${code}` : "Edificio sin nombre");
  const subtitle = name && code ? `Código ${code}` : null;

  const categories: string[] = [];
  if (remote) {
    categories.push(...categoriesForCode(code, catalog).map((category) => category.name));
  } else {
    if (props.amenity) {
      categories.push(prettyLabel(AMENITY_LABELS[props.amenity] ?? props.amenity));
    }
    if (props.faculty) {
      categories.push(prettyLabel(String(props.faculty)));
    }
    if (props.leisure) {
      categories.push(prettyLabel(String(props.leisure)));
    }
  }

  // Temporalmente ocultos: pisos y altura
  // const floors = floorsOf(props);
  // const detail = `${floors} piso${floors === 1 ? "" : "s"} · ~${Math.round(floors * METERS_PER_FLOOR)} m`;
  const detail = null;

  return { title, subtitle, code, categories, detail };
}

function averageRing(ring: GeoJsonPosition[]): LatLng | null {
  let longitude = 0;
  let latitude = 0;
  let count = 0;
  for (const position of ring) {
    if (position.length < 2) continue;
    longitude += position[0];
    latitude += position[1];
    count += 1;
  }
  if (count === 0) return null;
  return { longitude: longitude / count, latitude: latitude / count };
}

function geometryPoint(geometry: GeoJsonGeometry | null): LatLng | null {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    const [longitude, latitude] = geometry.coordinates;
    return { longitude, latitude };
  }
  if (geometry.type === "Polygon") {
    return averageRing(geometry.coordinates[0] ?? []);
  }
  if (geometry.type === "MultiPolygon") {
    return averageRing(geometry.coordinates[0]?.[0] ?? []);
  }
  return null;
}

function prettyLabel(value: string): string {
  return value
    .split(";")
    .map((part) =>
      part
        .trim()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase()),
    )
    .filter(Boolean)
    .join(" · ");
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function listCampusPlaces(
  collection: GeoJsonFeatureCollection,
  catalog?: CampusCatalog | null,
): CampusPlace[] {
  const places: CampusPlace[] = [];
  collection.features.forEach((feature, index) => {
    const building = (feature.properties ?? {}) as BuildingProperties;
    const info = placeInfo(building, catalog);
    if (info.title === "Edificio sin nombre") return;
    const point = entrancePoint(info.code) ?? geometryPoint(feature.geometry);
    if (!point) return;
    const fid = feature.properties?.fid;
    places.push({
      ...info,
      id: fid != null ? String(fid) : String(index),
      point,
      building,
    });
  });
  places.sort((a, b) => a.title.localeCompare(b.title, "es"));
  return places;
}

export function searchCampusPlaces(
  places: CampusPlace[],
  query: string,
  limit = 6,
): CampusPlace[] {
  const needle = normalize(query.trim());
  if (!needle) return [];
  return places
    .filter((place) => {
      const haystack = normalize(
        [place.title, place.code, place.subtitle, ...place.categories]
          .filter(Boolean)
          .join(" "),
      );
      return haystack.includes(needle);
    })
    .slice(0, limit);
}
