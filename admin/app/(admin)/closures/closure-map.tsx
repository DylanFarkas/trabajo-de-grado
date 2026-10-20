"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

export type SegmentProps = {
  key: string;
  kind: "osm" | "pasillo";
  name: string | null;
  highway: string | null;
  vehicle: boolean;
  lengthM: number | null;
};

type SegmentFeature = {
  type: "Feature";
  properties: SegmentProps;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

type SegmentCollection = { type: "FeatureCollection"; features: SegmentFeature[] };

/** Tramo que ya está en un cierre abierto. */
export type BusySegment = { key: string; closureId: number; status: string };

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const CAMPUS_BOUNDS: [[number, number], [number, number]] = [
  [-76.53756, 3.36814],
  [-76.52904, 3.38015],
];
const EMPTY: SegmentCollection = { type: "FeatureCollection", features: [] };

function subset(all: SegmentCollection, keys: ReadonlySet<string>, extra?: (key: string) => object) {
  return {
    type: "FeatureCollection" as const,
    features: all.features
      .filter((feature) => keys.has(feature.properties.key))
      .map((feature) => ({
        ...feature,
        properties: { ...feature.properties, ...(extra ? extra(feature.properties.key) : {}) },
      })),
  };
}

export function ClosureMap({
  selected = [],
  onToggle,
  onBusyClick,
  busy = [],
  focus = [],
  onSegmentsLoaded,
  className = "h-112",
}: {
  selected?: string[];
  onToggle?: (segment: SegmentProps) => void;
  onBusyClick?: (closureId: number) => void;
  busy?: BusySegment[];
  /** Tramos a resaltar y encuadrar al abrir, como los de un cierre ya creado. */
  focus?: string[];
  onSegmentsLoaded?: (segments: Map<string, SegmentProps>) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const segmentsRef = useRef<SegmentCollection>(EMPTY);
  const handlersRef = useRef({ onToggle, onBusyClick, busy, onSegmentsLoaded });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    handlersRef.current = { onToggle, onBusyClick, busy, onSegmentsLoaded };
  }, [onToggle, onBusyClick, busy, onSegmentsLoaded]);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    void (async () => {
      const [{ default: maplibregl }, response] = await Promise.all([
        import("maplibre-gl"),
        fetch("/campus/segments.geojson"),
      ]);
      if (!response.ok) throw new Error("No se pudo cargar la red de caminos del campus.");
      const segments = (await response.json()) as SegmentCollection;
      if (cancelled || !containerRef.current) return;
      segmentsRef.current = segments;
      handlersRef.current.onSegmentsLoaded?.(
        new Map(segments.features.map((feature) => [feature.properties.key, feature.properties])),
      );

      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        bounds: CAMPUS_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        if (!map) return;
        map.addSource("segments", { type: "geojson", data: segments });
        map.addSource("busy", { type: "geojson", data: EMPTY });
        map.addSource("selected", { type: "geojson", data: EMPTY });
        map.addLayer({
          id: "segments-line",
          type: "line",
          source: "segments",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["case", ["==", ["get", "kind"], "pasillo"], "#7c3aed", ["case", ["get", "vehicle"], "#52525b", "#a1a1aa"]],
            "line-width": ["interpolate", ["linear"], ["zoom"], 15, 2, 18, 5],
          },
        });
        map.addLayer({
          id: "busy-line",
          type: "line",
          source: "busy",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["match", ["get", "status"], "confirmed", "#dc2626", "provisional", "#f59e0b", "#8e8e93"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 15, 4, 18, 9],
            "line-dasharray": [1.2, 1],
          },
        });
        map.addLayer({
          id: "selected-line",
          type: "line",
          source: "selected",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#2563eb",
            "line-width": ["interpolate", ["linear"], ["zoom"], 15, 5, 18, 10],
          },
        });
        map.addLayer({
          id: "segments-hit",
          type: "line",
          source: "segments",
          paint: { "line-color": "#000000", "line-width": 18, "line-opacity": 0 },
        });
        setReady(true);
      });

      const interactive = Boolean(handlersRef.current.onToggle);
      if (interactive) {
        map.on("mousemove", "segments-hit", () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "segments-hit", () => {
          if (map) map.getCanvas().style.cursor = "";
        });
      }
      map.on("click", (event: MapMouseEvent) => {
        if (!map) return;
        const pad = 8;
        const hits = map.queryRenderedFeatures(
          [
            [event.point.x - pad, event.point.y - pad],
            [event.point.x + pad, event.point.y + pad],
          ],
          { layers: ["segments-hit"] },
        );
        const props = hits[0]?.properties as SegmentProps | undefined;
        if (!props?.key) return;
        const handlers = handlersRef.current;
        const taken = handlers.busy.find((item) => item.key === props.key);
        if (taken) {
          handlers.onBusyClick?.(taken.closureId);
          return;
        }
        handlers.onToggle?.(props);
      });
    })().catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el mapa.");
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  const selectedKey = selected.join(",");
  const busyKey = busy.map((item) => `${item.key}=${item.status}`).join(",");
  const focusKey = focus.join(",");

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const keys = new Set(selectedKey ? selectedKey.split(",") : []);
    for (const key of focusKey ? focusKey.split(",") : []) keys.add(key);
    (map.getSource("selected") as GeoJSONSource | undefined)?.setData(subset(segmentsRef.current, keys));
  }, [ready, selectedKey, focusKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const status = new Map(
      (busyKey ? busyKey.split(",") : []).map((entry) => entry.split("=") as [string, string]),
    );
    (map.getSource("busy") as GeoJSONSource | undefined)?.setData(
      subset(segmentsRef.current, new Set(status.keys()), (key) => ({ status: status.get(key) })),
    );
  }, [ready, busyKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focusKey) return;
    const keys = new Set(focusKey.split(","));
    const coords = segmentsRef.current.features
      .filter((feature) => keys.has(feature.properties.key))
      .flatMap((feature) => feature.geometry.coordinates);
    if (coords.length < 2) return;
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of coords) {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 80, maxZoom: 18, duration: 0 },
    );
  }, [ready, focusKey]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {loadError ? (
        <p className="absolute inset-x-4 top-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/60 dark:text-red-300">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
