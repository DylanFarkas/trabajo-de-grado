declare module "*.json" {
  import type { GeoJsonFeatureCollection } from "@/types/campus";
  const value: GeoJsonFeatureCollection;
  export default value;
}
