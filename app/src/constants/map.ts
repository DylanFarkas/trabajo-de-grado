/** Bounding box of Univalle campus layers (WGS84). */
export const CAMPUS_BOUNDS = {
  minLon: -76.53756,
  maxLon: -76.52904,
  minLat: 3.36814,
  maxLat: 3.38015,
} as const;

/**
 * Fixed on-campus point (near Biblioteca Central / E19) for local testing
 * when the developer is outside campus.
 */
export const MOCK_CAMPUS_LOCATION = {
  latitude: 3.376661,
  longitude: -76.534309,
} as const;

export const MAP_COLORS = {
  buildingFill: "#ebe0d0",
  buildingStroke: "#6b5a48",
  pathStroke: "#c4a574",
  park: "#b9d0ae",
  water: "#8ec5d8",
} as const;
