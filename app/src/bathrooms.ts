import espaciosJson from "@/assets/geojson/espacios.json";
import type { BathroomAudience, BathroomUnit, SpaceFeatureCollection } from "@/types/campus";

const AUDIENCES = new Set<BathroomAudience>(["hombres", "mujeres", "mixto"]);

export const BATHROOM_AUDIENCE_LABELS: Record<BathroomAudience, string> = {
  mujeres: "Mujeres",
  hombres: "Hombres",
  mixto: "Mixto",
};

export type BathroomFloorGroup = {
  piso: number;
  units: BathroomUnit[];
};

const bySpaceId = new Map<string, BathroomUnit[]>();
const byBuilding = new Map<string, BathroomUnit[]>();

function parseUnits(value: unknown): BathroomUnit[] {
  if (!Array.isArray(value)) return [];
  const units: BathroomUnit[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { piso?: unknown; publico?: unknown };
    const piso = typeof record.piso === "number" ? record.piso : Number(record.piso);
    const publico = record.publico;
    if (!Number.isInteger(piso) || piso < 1) continue;
    if (typeof publico !== "string" || !AUDIENCES.has(publico as BathroomAudience)) continue;
    units.push({ piso, publico: publico as BathroomAudience });
  }
  return units;
}

function indexBathrooms() {
  const spaces = espaciosJson as unknown as SpaceFeatureCollection;
  for (const feature of spaces.features ?? []) {
    const props = feature.properties;
    if (!props || props.tipo !== "bano") continue;
    const units = parseUnits(props.banos);
    if (units.length === 0) continue;
    const id = props.id?.trim();
    if (id) bySpaceId.set(id, units);
    const edificio = props.edificio?.trim();
    if (edificio) byBuilding.set(edificio, units);
  }
}

indexBathrooms();

/** Unidades del edificio (`E26`) o del espacio (`bano-e26`). */
export function bathroomsForCode(code: string | null | undefined): BathroomUnit[] {
  const key = code?.trim();
  if (!key) return [];
  return bySpaceId.get(key) ?? byBuilding.get(key) ?? [];
}

/** Pisos en orden ascendente, aunque el JSON los liste salteados. */
export function groupBathroomsByFloor(units: BathroomUnit[]): BathroomFloorGroup[] {
  const byFloor = new Map<number, BathroomUnit[]>();
  for (const unit of units) {
    const list = byFloor.get(unit.piso);
    if (list) list.push(unit);
    else byFloor.set(unit.piso, [unit]);
  }
  return [...byFloor.entries()].sort(([a], [b]) => a - b).map(([piso, list]) => ({ piso, units: list }));
}

export type BathroomAudienceCount = {
  publico: BathroomAudience;
  count: number;
};

const AUDIENCE_ORDER: BathroomAudience[] = ["mujeres", "hombres", "mixto"];

export function countByAudience(units: BathroomUnit[]): BathroomAudienceCount[] {
  return AUDIENCE_ORDER.map((publico) => ({
    publico,
    count: units.filter((unit) => unit.publico === publico).length,
  })).filter((entry) => entry.count > 0);
}

export function joinList(items: (string | number)[]): string {
  if (items.length <= 1) return String(items[0] ?? "");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** «4 baños · pisos 1 y 2». Vacío si el lugar no tiene unidades. */
export function bathroomSummary(code: string | null | undefined): string | null {
  const units = bathroomsForCode(code);
  if (units.length === 0) return null;
  const count = units.length === 1 ? "1 baño" : `${units.length} baños`;
  const floors = [...new Set(units.map((unit) => unit.piso))].sort((a, b) => a - b);
  const floorLabel = floors.length === 1 ? `piso ${floors[0]}` : `pisos ${joinList(floors)}`;
  return `${count} · ${floorLabel}`;
}
