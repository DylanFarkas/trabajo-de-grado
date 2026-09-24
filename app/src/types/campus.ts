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
