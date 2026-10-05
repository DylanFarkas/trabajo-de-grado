export type MapThemeMode = "auto" | "day" | "night";
export type MapTheme = "day" | "night";

export const MAP_STYLE_URLS: Record<MapTheme, string> = {
  day: "https://tiles.openfreemap.org/styles/liberty",
  night: "https://tiles.openfreemap.org/styles/dark",
};

/** Fondo detrás del WebView mientras carga, para que no destelle al abrir. */
export const MAP_BACKDROP: Record<MapTheme, string> = {
  day: "#dbe4ee",
  night: "#070b12",
};

/**
 * Noche en Cali (UTC-5, sin horario de verano). El sol sale cerca de las 6:00
 * y se pone cerca de las 18:00 todo el año, con unos 15 minutos de variación.
 */
export const CALI_NIGHT = {
  utcOffsetMinutes: -5 * 60,
  startMinutes: 18 * 60 + 15,
  endMinutes: 5 * 60 + 45,
} as const;

/** Medidas por tipo de poste, en metros. `reach` es lo que sale el brazo desde el fuste. */
export const LAMP_KINDS = {
  vial: { height: 7.5, radius: 20, reach: 2.4 },
  peatonal: { height: 3.8, radius: 12, reach: 0 },
} as const;

type BuildingTones = {
  library: string;
  food: string;
  culture: string;
  sport: string;
  tower: string;
  mid: string;
  stone: string;
};

export type MapPalette = {
  serviceCasing: string;
  serviceLine: string;
  footCasing: string;
  footLine: string;
  footDashedCasing: boolean;
  footCasingOpacity: number;
  steps: string;
  footprint: string;
  footprintOpacity: number;
  /** Relleno de un espacio en el suelo (parqueadero, cancha). No es un edificio. */
  spaceFill: string;
  spaceFillOpacity: number;
  spaceLine: string;
  buildings: BuildingTones;
  buildingOpacity: number;
  buildingGradient: boolean;
  /** Relleno de los edificios del mapa base cuando el estilo no trae `building-3d`. */
  baseBuildingRamp: [number, string][];
  selected: string;
  label: string;
  labelHalo: string;
  labelSelected: string;
  labelSelectedHalo: string;
  passageCasing: string;
  passageLine: string;
  routeCasing: string;
  routeLine: string;
  routeGlow: string;
  routeGlowOpacity: number;
  light: {
    anchor: "map" | "viewport";
    color: string;
    intensity: number;
    position: [number, number, number];
  };
  lamps: {
    poolVial: string;
    poolPeatonal: string;
    glow: string;
    core: string;
    metal: string;
    head: string;
    bulb: string;
    bulbOff: string;
  } | null;
  /** Ajustes de pintura sobre capas del estilo base, por id de capa. */
  base: Record<string, Record<string, unknown>>;
  /** Capas del estilo base que se ocultan. */
  hide: string[];
};

const DAY: MapPalette = {
  serviceCasing: "#cfcdca",
  serviceLine: "#ffffff",
  footCasing: "#d07c72",
  footLine: "#f4a89a",
  footDashedCasing: true,
  footCasingOpacity: 0.9,
  steps: "#e0897c",
  footprint: "#5b6672",
  footprintOpacity: 0.14,
  spaceFill: "#b7cbe4",
  spaceFillOpacity: 0.92,
  spaceLine: "#4f74a3",
  buildings: {
    library: "#e8eef1",
    food: "#efe8de",
    culture: "#ebe6ea",
    sport: "#e2ebe5",
    tower: "#d0cbc3",
    mid: "#ddd8d0",
    stone: "#e7e2d9",
  },
  buildingOpacity: 0.96,
  buildingGradient: true,
  baseBuildingRamp: [[0, "#e7e2d9"]],
  selected: "#950606",
  label: "#3a424c",
  labelHalo: "rgba(248,250,252,0.94)",
  labelSelected: "#ffffff",
  labelSelectedHalo: "rgba(17,17,17,0.88)",
  passageCasing: "#ffffff",
  passageLine: "#6d5b95",
  routeCasing: "#ffffff",
  routeLine: "#2563eb",
  routeGlow: "#93c5fd",
  routeGlowOpacity: 0.28,
  light: { anchor: "viewport", color: "#ffffff", intensity: 0.5, position: [1.15, 210, 30] },
  lamps: null,
  base: {},
  hide: [
    "road_path_pedestrian",
    "tunnel_path_pedestrian",
    "bridge_path_pedestrian",
    "bridge_path_pedestrian_casing",
  ],
};

const NIGHT: MapPalette = {
  serviceCasing: "#0a0e14",
  serviceLine: "#3e4859",
  footCasing: "#0a0e14",
  footLine: "#d2b183",
  footDashedCasing: false,
  footCasingOpacity: 0.75,
  steps: "#d0a773",
  footprint: "#04070b",
  footprintOpacity: 0,
  spaceFill: "#24344c",
  spaceFillOpacity: 0.94,
  spaceLine: "#8eb0d6",
  buildings: {
    library: "#7d8798",
    food: "#8a8074",
    culture: "#847c8c",
    sport: "#748680",
    tower: "#6e7686",
    mid: "#787f90",
    stone: "#808898",
  },
  buildingOpacity: 1,
  buildingGradient: false,
  baseBuildingRamp: [
    [4, "#747c8e"],
    [16, "#868e9f"],
    [36, "#9aa2b2"],
  ],
  selected: "#e0484d",
  label: "#f1ede4",
  labelHalo: "rgba(6,9,14,0.92)",
  labelSelected: "#ffffff",
  labelSelectedHalo: "rgba(110,16,22,0.92)",
  passageCasing: "#141a26",
  passageLine: "#a898e0",
  routeCasing: "#0b1220",
  routeLine: "#60a5fa",
  routeGlow: "#3b82f6",
  routeGlowOpacity: 0.5,
  light: { anchor: "map", color: "#d5deee", intensity: 0.32, position: [1.15, 150, 18] },
  lamps: {
    poolVial: "#ffb45e",
    poolPeatonal: "#ffcf8a",
    glow: "#ffd79a",
    core: "#fff3d9",
    metal: "#5a616c",
    head: "#262a31",
    bulb: "#fff6d8",
    bulbOff: "#4b5260",
  },
  base: {
    background: { "background-color": "#070b12" },
    landcover_wood: { "fill-color": "#0c1512" },
    landuse_park: { "fill-color": "#0d1613" },
    landuse_residential: { "fill-color": "#0b1018" },
    water: { "fill-color": "#08131f" },
    waterway: { "line-color": "#0a1828" },
    highway_minor: { "line-color": "#171d27" },
    highway_major_casing: { "line-color": "#262e3b" },
    highway_major_inner: { "line-color": "#1a2029" },
    highway_name_other: {
      "text-color": "#9aa4b3",
      "text-halo-color": "#05080d",
      "text-halo-width": 1.4,
    },
    highway_name_motorway: { "text-color": "#9aa4b3" },
  },
  hide: [
    "building",
    "highway_path",
    "road_path_pedestrian",
    "tunnel_path_pedestrian",
    "bridge_path_pedestrian",
    "bridge_path_pedestrian_casing",
  ],
};

export const MAP_PALETTES: Record<MapTheme, MapPalette> = { day: DAY, night: NIGHT };
