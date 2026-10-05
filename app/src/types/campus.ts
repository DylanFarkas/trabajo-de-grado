export type GeoJsonPosition = [number, number] | [number, number, number];

export type GeoJsonGeometry =
  | { type: "Point"; coordinates: GeoJsonPosition }
  | { type: "MultiPoint"; coordinates: GeoJsonPosition[] }
  | { type: "LineString"; coordinates: GeoJsonPosition[] }
  | { type: "MultiLineString"; coordinates: GeoJsonPosition[][] }
  | { type: "Polygon"; coordinates: GeoJsonPosition[][] }
  | { type: "MultiPolygon"; coordinates: GeoJsonPosition[][][] };

export type GeoJsonProperties = Record<string, string | number | boolean | null> | null;

export type GeoJsonFeature = {
  type: "Feature";
  geometry: GeoJsonGeometry | null;
  properties: GeoJsonProperties;
  id?: string | number;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type BuildingProperties = {
  fid?: number | null;
  "addr:housename"?: string | null;
  "addr:housenumber"?: string | null;
  "building:levels"?: string | number | null;
  amenity?: string | null;
  faculty?: string | null;
  leisure?: string | null;
  sport?: string | null;
  altura?: number | null;
  name?: string | null;
  floors?: number | null;
  height_m?: number | null;
};

/** `vial`: poste alto con brazo (calles, parqueaderos). `peatonal`: farol bajo de sendero. */
export type LampPostKind = "vial" | "peatonal";

/** Un poste `dañado` se dibuja apagado y no ilumina. */
export type LampPostStatus = "funciona" | "dañado" | "sin_verificar";

/** Tipo fijo del espacio. La ruta “más cercana” filtra por esto, no por una categoría del admin. */
export type SpaceKind = "bano" | "parqueadero" | "cancha";

/**
 * Propiedades de cada feature de `espacios.json`.
 * El punto de ruta es `centro`. Si falta, se usa el Point o el centroide del polígono.
 * El polígono, cuando existe, es el área que se pinta en el mapa.
 */
export type SpaceProperties = {
  id: string;
  nombre: string;
  tipo: SpaceKind;
  edificio?: string | null;
  notas?: string | null;
  /** [longitud, latitud] */
  centro?: [number, number] | null;
  /** Texto corto sobre el área. Si falta, el mapa usa `nombre`. */
  etiqueta?: string | null;
};

export type SpaceFeatureCollection = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: GeoJsonGeometry | null;
    properties: SpaceProperties;
  }[];
};

/** Propiedades de cada punto de `postes.json`. El punto es la base del poste. */
export type LampPostProperties = {
  id: string;
  tipo: LampPostKind;
  /** Grados desde el norte, en sentido horario. Solo `vial`; si falta, apunta al camino más cercano. */
  rumbo?: number | null;
  brazos?: 1 | 2 | null;
  altura_m?: number | null;
  /** Solo para excepciones; si falta, sale del tipo. */
  radio_m?: number | null;
  estado: LampPostStatus;
  /** Fecha ISO de la última verificación en campo. */
  verificado?: string | null;
  notas?: string | null;
};
