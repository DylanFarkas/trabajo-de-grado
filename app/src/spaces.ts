import { categoriesForCode, type CampusCatalog } from "@/places";
import {
  listSpaces as listSpaceRecords,
  nearestSpace as nearestSpaceRecord,
  spacePoint,
  type CampusSpace,
} from "@/routing/graph";
import type { SpaceKind } from "@/types/campus";

export type CatalogSpace = CampusSpace & {
  title: string;
  description: string | null;
  categories: string[];
};

function withCatalog(space: CampusSpace, catalog?: CampusCatalog | null): CatalogSpace {
  const remote = catalog?.places[space.id];
  return {
    ...space,
    title: remote?.name || space.nombre,
    description: remote?.description ?? null,
    categories: categoriesForCode(space.id, catalog).map((category) => category.name),
  };
}

/** Nombre, descripción y categorías salen de la ficha cuando existe. */
export function listSpaces(tipo?: SpaceKind, catalog?: CampusCatalog | null): CatalogSpace[] {
  return listSpaceRecords(tipo).map((space) => withCatalog(space, catalog));
}

export function nearestSpace(
  origin: { latitude: number; longitude: number },
  tipo: SpaceKind,
  catalog?: CampusCatalog | null,
): (CatalogSpace & { distanceM: number }) | null {
  const found = nearestSpaceRecord(origin, tipo);
  if (!found) return null;
  return { ...withCatalog(found, catalog), distanceM: found.distanceM };
}

export { spacePoint };
