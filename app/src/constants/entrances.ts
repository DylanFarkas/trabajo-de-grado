import type { LatLng } from "@/routing/graph";

export type CampusEntrance = {
  id: string;
  name: string;
  street: string;
  /** WGS84 — edita latitude/longitude aquí. */
  point: LatLng;
};

/**
 * Entradas Univalle Meléndez.
 * Al llegar o salir del campus, `hybridRoute` elige sola la que acorta calle + tramo interno
 * (o hasta el parqueadero, en carro). El usuario no las selecciona.
 * La moto no usa estas porterías: entra por `MOTORCYCLE_ENTRANCE`.
 *
 * Cómo ajustar la posición: en Google Maps / OSM, clic derecho en el portón → copiar
 * coordenadas (OJO: Google muestra lat, lon; aquí va longitude primero, luego latitude).
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

/**
 * Acceso de calle del parqueadero de motos (P14).
 * Google Maps: 3.370187, -76.534785 → aquí latitude, longitude.
 * La ruta en moto termina la calle en este punto y sigue a pie desde P14.
 * No entra en `CAMPUS_ENTRANCES`: carro, bici y a pie no pasan por aquí.
 */
export const MOTORCYCLE_ENTRANCE: CampusEntrance = {
  id: "p14-moto",
  name: "Entrada parqueadero de motos",
  street: "Acceso motos",
  point: { latitude: 3.370187, longitude: -76.534785 },
};
