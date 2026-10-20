#!/usr/bin/env node
// Copia los tramos cerrables de la app (aristas OSM y pasillos) a public/campus/segments.geojson.
// Usa las mismas claves que app/src/routing/graph.ts: osm:<id_segmento> y pasillo:<id_pasillo>.
// `--check` no escribe: falla si el archivo del panel quedó desactualizado.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const geojsonDir = resolve(here, "../../app/assets/geojson");
const outFile = resolve(here, "../public/campus/segments.geojson");
const check = process.argv.includes("--check");

const VEHICLE_HIGHWAYS = new Set([
  "service",
  "tertiary",
  "tertiary_link",
  "secondary",
  "primary",
  "primary_link",
]);

async function readJson(name) {
  return JSON.parse(await readFile(resolve(geojsonDir, name), "utf8"));
}

function lineCoords(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return geometry.coordinates.map((p) => [p[0], p[1]]);
  if (geometry.type === "MultiLineString") {
    const out = [];
    for (const part of geometry.coordinates) {
      for (const p of part) {
        const last = out[out.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([p[0], p[1]]);
      }
    }
    return out;
  }
  return [];
}

function text(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

const [nodos, aristas, pasillos] = await Promise.all([
  readJson("nodos.json"),
  readJson("aristas_red.json"),
  readJson("pasillos.json"),
]);

const nodeIds = new Set(
  nodos.features
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => Number(f.properties?.id_nodo))
    .filter((id) => !Number.isNaN(id)),
);

const features = [];

for (const feature of aristas.features) {
  const props = feature.properties ?? {};
  const from = Number(props.id_nodo);
  const to = Number(props.fin_id_nodo);
  const weight = Number(props.longitud_m);
  const id = Number(props.id_segmento);
  const coordinates = lineCoords(feature.geometry);
  if (!Number.isInteger(id) || !(weight > 0) || coordinates.length < 2) continue;
  if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
  const highway = typeof props.highway === "string" ? props.highway : null;
  features.push({
    type: "Feature",
    properties: {
      key: `osm:${id}`,
      kind: "osm",
      name: text(props.name) ?? text(props.alt_name),
      highway,
      vehicle: Boolean(highway && VEHICLE_HIGHWAYS.has(highway) && props.access !== "no"),
      lengthM: Math.round(weight * 10) / 10,
    },
    geometry: { type: "LineString", coordinates },
  });
}

for (const feature of pasillos.features) {
  const props = feature.properties ?? {};
  const id = Number(props.id_pasillo);
  const coordinates = lineCoords(feature.geometry);
  if (!Number.isInteger(id) || coordinates.length < 2) continue;
  const stated = Number(props.longitud_m);
  features.push({
    type: "Feature",
    properties: {
      key: `pasillo:${id}`,
      kind: "pasillo",
      name: text(props.name) ?? (text(props.edificio) ? `Pasillo ${text(props.edificio)}` : null),
      highway: "corridor",
      vehicle: false,
      lengthM: stated > 0 ? Math.round(stated * 10) / 10 : null,
    },
    geometry: { type: "LineString", coordinates },
  });
}

const body = `${JSON.stringify({ type: "FeatureCollection", features })}\n`;

if (check) {
  const current = await readFile(outFile, "utf8").catch(() => "");
  if (current !== body) {
    console.error("public/campus/segments.geojson está desactualizado. Ejecuta: node scripts/sync-segments.mjs");
    process.exit(1);
  }
  console.log(`segments.geojson al día (${features.length} tramos).`);
} else {
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, body);
  console.log(`Escribí ${features.length} tramos en public/campus/segments.geojson.`);
}
