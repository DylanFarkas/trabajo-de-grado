import type { LatLng } from "@/routing/graph";

export type CampusEntrance = {
  id: string;
  name: string;
  street: string;
  /** WGS84 — edita latitude/longitude aquí o reubica tocando el mapa en la app. */
  point: LatLng;
};

/**
 * Entradas Univalle Meléndez.
 *
 * Cómo ajustar la posición:
 * 1. En la app: Ir al campus → "Reubicar" en una entrada → toca el mapa en el portón real.
 *    El estado mostrará lon/lat para pegar aquí.
 * 2. O en Google Maps / OSM: clic derecho en el portón → copiar coordenadas
 *    (OJO: Google muestra lat, lon; aquí va longitude primero, luego latitude).
 *
 * Ejemplo: en Maps ves "3.37508, -76.53722" →
 *   point: { latitude: 3.37508, longitude: -76.53722 }
 */
export const CAMPUS_ENTRANCES: CampusEntrance[] = [
  {
    id: "cra-86",
    name: "Entrada Carrera 86",
    street: "Carrera 86",
    point: { longitude: -76.532344, latitude: 3.379789 },
  },
  {
    id: "calle-16",
    name: "Entrada Calle 16",
    street: "Calle 16",
    point: { longitude: -76.529549, latitude: 3.371799 },
  },
  {
    id: "calle-13",
    name: "Entrada Calle 13",
    street: "Calle 13",
    point: { longitude: -76.537210, latitude: 3.375066 },
  },
];
