import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { withUniwind } from "uniwind";
import * as Location from "expo-location";

import edificios from "@/assets/geojson/edificios.json";
import aristasRed from "@/assets/geojson/aristas_red.json";
import pasillos from "@/assets/geojson/pasillos.json";
import espacios from "@/assets/geojson/espacios.json";
import { BUILDING_HEIGHT_OVERRIDES, CAMPUS_BOUNDS, MOCK_CAMPUS_LOCATION } from "@/constants/map";
import {
  LAMP_KINDS,
  MAP_BACKDROP,
  MAP_PALETTES,
  MAP_STYLE_URLS,
  type MapTheme,
} from "@/constants/mapTheme";
import { useMapTheme } from "@/map-theme";
import { catalogMapTone, categoriesForCode, placeInfo, type CampusCatalog, type PresetRoute } from "@/places";
import {
  destinationFromBuilding,
  findDestination,
  findDestinationByPlaceId,
  listDestinations,
  searchDestinations,
  spaceKindLabel,
  type CampusDestination,
} from "@/destinations";
import { bathroomSummary } from "@/bathrooms";
import { nearestSpace } from "@/spaces";
import { readCachedCatalog, refreshCatalog } from "@/catalog";
import {
  buildPlaceCatalog,
  parseRouteIntent,
  RouteIntentError,
} from "@/routing/deepseekIntent";
import {
  campusSegment,
  entrancePoint,
  formatDistance,
  nearestNodeId,
  nodeLatLng,
  segmentAtPoint,
  segmentsOnRoute,
  setClosureImpact,
  spacePoint,
  type ClosureImpact,
  type LatLng,
  type SegmentKey,
  type WalkCost,
} from "@/routing/graph";
import {
  ClosureIsolationError,
  formatDuration,
  pointInCampus,
  routeHybrid,
  orderStopsFromOrigin,
  pointLetter,
  routeThroughPoints,
  type HybridRouteResult,
} from "@/routing/hybridRoute";
import { campusLampPosts } from "@/routing/lampLight";
import { streetSourceLabel, type StreetProfile } from "@/routing/openRouteService";
import type { BuildingProperties, GeoJsonFeatureCollection } from "@/types/campus";
import { MapHeader } from "@/components/MapHeader";
import { AssistantSheet } from "@/components/AssistantSheet";
import { ExploreSheet } from "@/components/ExploreSheet";
import { homeTabBarHeight } from "@/components/HomeTabs";
import { MapControls } from "@/components/MapControls";
import { RouteSheet, type RouteClosureNotice, type RouteSlot } from "@/components/RouteSheet";
import { useSheetPresence } from "@/components/SnapSheet";
import { ReportsSheet } from "@/components/ReportsSheet";
import { ToursSheet } from "@/components/ToursSheet";
import { ClosureComposer } from "@/components/ClosureComposer";
import { ClosureDetail } from "@/components/ClosureDetail";
import { ClosurePromptCard, ClosureReportBar } from "@/components/ClosureOverlays";
import { useMapPanel, type MapPanel } from "@/map-panel";
import { useAuth } from "@/auth";
import {
  CLOSURE_MAX_SEGMENTS,
  avoidSegments,
  closureImpact,
  markClosurePrompted,
  recentlyPromptedClosures,
  relaxImpact,
  type ActiveClosure,
} from "@/closures";
import {
  ON_SITE_RADIUS_M,
  POSITION_MODE,
  distanceToSegmentsM,
  isOnSite,
  positionIsTrusted,
  serverPositionSource,
  useEffectivePosition,
} from "@/location/position";
import { useCampusClosures } from "@/useClosures";

const UniWebView = withUniwind(WebView);

/** Tramos cerca de la ruta que cuentan como "evitados" en el aviso. */
const AVOIDED_NEAR_M = 80;

type ClosureOverride = { kind: "avoid"; keys: SegmentKey[] } | { kind: "relaxed" } | null;

function impactSignature(impact: ClosureImpact): string {
  return `${[...impact.blocked].sort().join(",")}|${[...impact.penalized].sort().join(",")}`;
}

function closuresGeoJson(closures: readonly ActiveClosure[]) {
  const features = [];
  for (const closure of closures) {
    for (const key of closure.segmentKeys) {
      const segment = campusSegment(key);
      if (!segment) continue;
      features.push({
        type: "Feature" as const,
        properties: { closureId: closure.id, status: closure.status },
        geometry: { type: "LineString" as const, coordinates: segment.coordinates },
      });
    }
  }
  return { type: "FeatureCollection" as const, features };
}

function draftGeoJson(keys: readonly SegmentKey[]) {
  return {
    type: "FeatureCollection" as const,
    features: keys.flatMap((key) => {
      const segment = campusSegment(key);
      return segment
        ? [
            {
              type: "Feature" as const,
              properties: { key },
              geometry: { type: "LineString" as const, coordinates: segment.coordinates },
            },
          ]
        : [];
    }),
  };
}

function samePoint(a: LatLng | null | undefined, b: LatLng | null | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a.latitude - b.latitude) < 1e-7 && Math.abs(a.longitude - b.longitude) < 1e-7;
}

type SelectedPlace = {
  snapped: LatLng;
  destination: CampusDestination;
};

function snapCampusPoint(point: LatLng): LatLng {
  if (!pointInCampus(point)) return point;
  const nodeId = nearestNodeId(point);
  return (nodeId != null ? nodeLatLng(nodeId) : null) ?? point;
}

/** Door on the path when the building has one; otherwise the nearest node. */
function pointForBuilding(
  building: BuildingProperties | null | undefined,
  fallback: LatLng,
  toward?: LatLng | null,
): LatLng {
  const code = building?.["addr:housenumber"];
  const entrance =
    code != null && code !== "" ? entrancePoint(String(code), toward) : null;
  if (entrance && pointInCampus(entrance)) return entrance;
  return snapCampusPoint(fallback);
}

/** Puerta del edificio, o el nodo enganchado del espacio. */
function pointForDestination(destination: CampusDestination, toward?: LatLng | null): LatLng {
  if (destination.kind === "space") {
    return (destination.spaceId ? spacePoint(destination.spaceId) : null) ?? destination.point;
  }
  return pointForBuilding(destination.building, destination.point, toward);
}

/** Con las dos puntas, cada edificio usa la puerta que acorta el recorrido. */
function doorsForEnds(
  origin: LatLng | null,
  destination: LatLng | null,
  originPlace: CampusDestination | null,
  destinationPlace: CampusDestination | null,
): { origin: LatLng | null; destination: LatLng | null } {
  let nextOrigin = origin;
  let nextDestination = destination;
  if (nextOrigin && nextDestination && destinationPlace?.kind === "building") {
    nextDestination = pointForDestination(destinationPlace, nextOrigin);
  }
  if (nextOrigin && nextDestination && originPlace?.kind === "building") {
    nextOrigin = pointForDestination(originPlace, nextDestination);
  }
  return { origin: nextOrigin, destination: nextDestination };
}

function withExtrusionHeight(
  collection: GeoJsonFeatureCollection,
  catalog: CampusCatalog | null,
): GeoJsonFeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const props = (feature.properties ?? {}) as BuildingProperties;
      const code = props["addr:housenumber"] ? String(props["addr:housenumber"]) : null;
      const override = code ? BUILDING_HEIGHT_OVERRIDES[code] : undefined;
      const height_m = override != null && override > 0 ? override : 0;
      const amenity = props.amenity ? String(props.amenity) : "";
      const label =
        props["addr:housenumber"] ||
        props["addr:housename"] ||
        props.name ||
        "";
      const remoteTone = catalogMapTone(code, catalog);
      let tone = "stone";
      if (remoteTone) tone = remoteTone;
      else if (amenity === "library") tone = "library";
      else if (amenity === "restaurant" || amenity === "cafe") tone = "food";
      else if (amenity === "theatre") tone = "culture";
      else if (props.leisure || amenity === "sports_centre") tone = "sport";
      else if (height_m >= 24) tone = "tower";
      else if (height_m >= 14) tone = "mid";
      return {
        ...feature,
        properties: {
          ...props,
          height_m,
          tone,
          label: String(label),
        },
      };
    }),
  };
}

function buildMapHtml(initialTheme: MapTheme): string {
  const centerLat = (CAMPUS_BOUNDS.minLat + CAMPUS_BOUNDS.maxLat) / 2;
  const centerLon = (CAMPUS_BOUNDS.minLon + CAMPUS_BOUNDS.maxLon) / 2;
  const config = JSON.stringify({
    styles: MAP_STYLE_URLS,
    backdrops: MAP_BACKDROP,
    palettes: MAP_PALETTES,
    lampKinds: LAMP_KINDS,
    centerLat,
  });

  return `<!DOCTYPE html>
<html data-theme="${initialTheme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
    html, body { background: ${MAP_BACKDROP.day}; }
    html[data-theme="night"] { background: ${MAP_BACKDROP.night}; }
    #map { background: transparent; }
    body[data-theme="night"] {
      background: linear-gradient(180deg, #03060c 0%, #0a1426 20%, #17223b 32%, ${MAP_BACKDROP.night} 46%);
    }
    .night-vignette, .theme-veil {
      position: absolute; inset: 0; pointer-events: none; opacity: 0;
    }
    .night-vignette {
      transition: opacity 0.5s ease;
      background: radial-gradient(ellipse at 50% 58%, transparent 52%, rgba(3,5,10,0.55) 100%);
    }
    body[data-theme="night"] .night-vignette { opacity: 1; }
    .theme-veil { transition: opacity 0.45s ease; }
    .theme-veil.on { opacity: 1; transition-duration: 0.18s; }

    .maplibregl-ctrl-attrib { font-size: 10px; }
    .route-marker {
      width: 30px; height: 30px; border-radius: 15px;
      border: 2.5px solid #fff; box-shadow: 0 6px 16px rgba(28,25,23,0.32);
      display: flex; align-items: center; justify-content: center;
      font: 800 12px system-ui, sans-serif; color: #fff;
    }
    .route-marker.origin, .route-marker.stop { background: #111111; }
    .route-marker.dest, .route-marker.stop-last { background: #2563eb; }
    .route-marker.parking { background: #0f766e; }
    .route-marker.parking.bike { background: #ea580c; }
    .route-marker.parking.moto { background: #475569; }
    .route-marker svg { width: 17px; height: 17px; fill: currentColor; }
    .entrance-marker {
      width: 28px; height: 28px; border-radius: 14px;
      background: #111111; border: 2.5px solid #fff;
      box-shadow: 0 6px 14px rgba(17,17,17,0.28);
      display: flex; align-items: center; justify-content: center;
      font: 800 11px system-ui, sans-serif; color: #fff;
    }
    .user-marker {
      position: relative;
      width: 18px; height: 18px; border-radius: 9px;
      background: #2563eb; border: 3px solid #fff;
      box-shadow: 0 0 0 6px rgba(37,99,235,0.22), 0 6px 14px rgba(17,17,17,0.28);
    }
    .route-marker, .entrance-marker, .user-marker {
      transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, color 0.3s ease;
    }
    .maplibregl-ctrl-bottom-left { bottom: 220px; left: 12px; }
    .maplibregl-ctrl-group { border-radius: 14px !important; overflow: hidden; box-shadow: 0 8px 18px rgba(17,17,17,0.12); }

    body[data-theme="night"] .route-marker {
      border-color: #0b1220;
      box-shadow: 0 0 0 1.5px rgba(226,232,240,0.35), 0 8px 18px rgba(0,0,0,0.55);
    }
    body[data-theme="night"] .route-marker.origin,
    body[data-theme="night"] .route-marker.stop,
    body[data-theme="night"] .entrance-marker { background: #eef2f7; color: #0b1220; }
    body[data-theme="night"] .route-marker.dest,
    body[data-theme="night"] .route-marker.stop-last {
      background: #3b82f6; color: #ffffff;
      box-shadow: 0 0 0 1.5px rgba(147,197,253,0.55), 0 0 18px rgba(59,130,246,0.6), 0 8px 18px rgba(0,0,0,0.5);
    }
    body[data-theme="night"] .route-marker.parking {
      background: #2dd4bf; color: #042f2e;
    }
    body[data-theme="night"] .route-marker.parking.bike {
      background: #fb923c; color: #431407;
    }
    body[data-theme="night"] .route-marker.parking.moto {
      background: #94a3b8; color: #0f172a;
    }
    body[data-theme="night"] .entrance-marker {
      border-color: #0b1220;
      box-shadow: 0 0 0 1.5px rgba(226,232,240,0.35), 0 8px 16px rgba(0,0,0,0.55);
    }
    body[data-theme="night"] .user-marker {
      background: #60a5fa; border-color: #0b1220;
      box-shadow: 0 0 0 6px rgba(96,165,250,0.22), 0 0 22px rgba(96,165,250,0.6);
    }
    body[data-theme="night"] .user-marker::after {
      content: ""; position: absolute; inset: -3px; border-radius: 50%;
      border: 2px solid rgba(96,165,250,0.7);
      animation: user-pulse 2.4s ease-out infinite;
    }
    @keyframes user-pulse {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(3.2); opacity: 0; }
    }
    body[data-theme="night"] .maplibregl-ctrl-group {
      background: #121821;
      box-shadow: 0 8px 18px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06);
    }
    body[data-theme="night"] .maplibregl-ctrl-group button + button { border-top-color: #232c3a; }
    body[data-theme="night"] .maplibregl-ctrl-icon { filter: invert(0.92); }
    body[data-theme="night"] .maplibregl-ctrl-attrib { background: rgba(7,11,18,0.72); color: #8b95a5; }
    body[data-theme="night"] .maplibregl-ctrl-attrib a { color: #aab4c3; }
    body[data-theme="night"] .maplibregl-ctrl-attrib-button { filter: invert(1); }
    body[data-theme="night"] .maplibregl-popup-content {
      background: #141b25; color: #eef2f7; box-shadow: 0 10px 24px rgba(0,0,0,0.5);
    }
    body[data-theme="night"] .maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-top-color: #141b25; }
    body[data-theme="night"] .maplibregl-popup-anchor-top .maplibregl-popup-tip { border-bottom-color: #141b25; }
    body[data-theme="night"] .maplibregl-popup-anchor-left .maplibregl-popup-tip { border-right-color: #141b25; }
    body[data-theme="night"] .maplibregl-popup-anchor-right .maplibregl-popup-tip { border-left-color: #141b25; }
    body[data-theme="night"] .maplibregl-popup-close-button { color: #aab4c3; }
  </style>
</head>
<body data-theme="${initialTheme}">
  <div id="map"></div>
  <script>
    function post(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    var CONFIG = ${config};
    var theme = '${initialTheme}';
    var styleBusy = true;
    var pendingTheme = null;
    var campus = null;
    var lampData = null;
    var routeDrive = null;
    var routeWalk = null;
    var routeBike = false;
    var parkingMarker = null;
    var BIKE_SVG = '<svg viewBox="0 0 24 24"><path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/></svg>';
    var MOTO_SVG = '<svg viewBox="0 0 24 24"><path d="M20 11c-.18 0-.36.03-.53.05L17.41 9H20V6l-3.72 1.86L13.41 5H9v2h3.59l2 2H11l-4 2-2-2H0v2h4c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4l2 2h3l3.49-6.1 1.01 1.01c-.91.73-1.5 1.84-1.5 3.09 0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4zM4 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm16 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>';
    var cameraFitted = false;

    function palette() { return CONFIG.palettes[theme]; }

    const map = new maplibregl.Map({
      container: 'map',
      style: CONFIG.styles[theme],
      center: [${centerLon}, ${centerLat}],
      zoom: 16.2,
      pitch: 58,
      bearing: -28,
      maxPitch: 75,
      canvasContextAttributes: { antialias: true }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), 'bottom-left');

    // Mantener presionado fija la ubicación de prueba sin disparar el clic normal.
    var suppressMapClickUntil = 0;
    var longPressTimer = null;
    var longPressStart = null;
    function cancelLongPress() {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStart = null;
    }
    function armLongPress(x, y) {
      cancelLongPress();
      longPressStart = { x: x, y: y };
      longPressTimer = setTimeout(function () {
        var lngLat = map.unproject([x, y]);
        suppressMapClickUntil = Date.now() + 1200;
        post({ type: 'map-long-press', longitude: lngLat.lng, latitude: lngLat.lat });
        cancelLongPress();
      }, 600);
    }
    function movedLongPress(x, y) {
      if (!longPressStart) return;
      if (Math.hypot(x - longPressStart.x, y - longPressStart.y) > 10) cancelLongPress();
    }
    var mapCanvas = map.getCanvas();
    mapCanvas.addEventListener('touchstart', function (event) {
      if (event.touches.length !== 1) { cancelLongPress(); return; }
      var rect = mapCanvas.getBoundingClientRect();
      var touch = event.touches[0];
      armLongPress(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: true });
    mapCanvas.addEventListener('touchmove', function (event) {
      if (event.touches.length !== 1) { cancelLongPress(); return; }
      var rect = mapCanvas.getBoundingClientRect();
      var touch = event.touches[0];
      movedLongPress(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: true });
    mapCanvas.addEventListener('touchend', cancelLongPress, { passive: true });
    mapCanvas.addEventListener('touchcancel', cancelLongPress, { passive: true });
    mapCanvas.addEventListener('mousedown', function (event) { armLongPress(event.offsetX, event.offsetY); });
    mapCanvas.addEventListener('mousemove', function (event) { movedLongPress(event.offsetX, event.offsetY); });
    window.addEventListener('mouseup', cancelLongPress);

    var vignette = document.createElement('div');
    vignette.className = 'night-vignette';
    map.getCanvasContainer().appendChild(vignette);
    var veil = document.createElement('div');
    veil.className = 'theme-veil';
    map.getCanvasContainer().appendChild(veil);

    var chromeBottom = 220;
    window.setChromeBottom = function (px) {
      chromeBottom = px;
      var node = document.querySelector('.maplibregl-ctrl-bottom-left');
      if (node) node.style.bottom = px + 'px';
    };

    var is3d = true;
    function applyView3d(enabled) {
      is3d = enabled;
      var center = map.getCenter();
      if (enabled) {
        map.easeTo({ center: center, zoom: Math.max(map.getZoom(), 16), pitch: 60, bearing: -28, duration: 900, essential: true });
      } else {
        map.easeTo({ center: center, pitch: 0, bearing: 0, duration: 700, essential: true });
      }
      post({ type: 'view-mode', mode: enabled ? '3d' : '2d' });
    }

    window.setCampusView = function (mode) {
      applyView3d(mode === '3d');
    };

    window.focusPlace = function (lng, lat) {
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 17.2),
        offset: [0, -Math.round(chromeBottom / 3)],
        duration: 700,
        essential: true
      });
    };

    var originMarker = null;
    var destMarker = null;
    var stopMarkers = [];
    var userMarker = null;
    var entranceMarkers = [];
    var selectedBuildingId = null;
    var selectedSpaceId = null;

    function makeMarkerEl(kind, letter) {
      var el = document.createElement('div');
      el.className = 'route-marker ' + kind;
      el.textContent = letter;
      return el;
    }

    function makeEntranceEl(label) {
      var el = document.createElement('div');
      el.className = 'entrance-marker';
      el.textContent = label;
      return el;
    }

    function setMarker(kind, lng, lat) {
      var existing = kind === 'origin' ? originMarker : destMarker;
      if (existing) existing.remove();
      var marker = new maplibregl.Marker({ element: makeMarkerEl(kind, kind === 'origin' ? 'A' : 'B') })
        .setLngLat([lng, lat])
        .addTo(map);
      if (kind === 'origin') originMarker = marker;
      else destMarker = marker;
    }

    window.setEntranceMarkers = function (entrances) {
      entranceMarkers.forEach(function (m) { m.remove(); });
      entranceMarkers = [];
      if (!entrances || !entrances.length) return;
      entrances.forEach(function (item, index) {
        var marker = new maplibregl.Marker({
          element: makeEntranceEl(String(index + 1))
        })
          .setLngLat([item.longitude, item.latitude])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText(item.name || ('Entrada ' + (index + 1))))
          .addTo(map);
        entranceMarkers.push(marker);
      });
    };

    window.setSelectedBuilding = function (fid) {
      if (selectedBuildingId != null && map.getSource('buildings')) {
        try {
          map.setFeatureState({ source: 'buildings', id: selectedBuildingId }, { selected: false });
        } catch (e) {}
      }
      selectedBuildingId = fid == null || fid === '' ? null : fid;
      if (selectedBuildingId != null && map.getSource('buildings')) {
        try {
          map.setFeatureState({ source: 'buildings', id: selectedBuildingId }, { selected: true });
        } catch (e) {}
      }
    };

    window.setSelectedSpace = function (id) {
      if (selectedSpaceId != null && map.getSource('espacios')) {
        try {
          map.setFeatureState({ source: 'espacios', id: selectedSpaceId }, { selected: false });
        } catch (e) {}
      }
      selectedSpaceId = id == null || id === '' ? null : id;
      if (selectedSpaceId != null && map.getSource('espacios')) {
        try {
          map.setFeatureState({ source: 'espacios', id: selectedSpaceId }, { selected: true });
        } catch (e) {}
      }
    };

    function clearStopMarkers() {
      stopMarkers.forEach(function (marker) { marker.remove(); });
      stopMarkers = [];
    }

    window.setRouteEndpoints = function (origin, destination) {
      clearStopMarkers();
      if (origin) setMarker('origin', origin.longitude, origin.latitude);
      else if (originMarker) { originMarker.remove(); originMarker = null; }
      if (destination) setMarker('dest', destination.longitude, destination.latitude);
      else if (destMarker) { destMarker.remove(); destMarker = null; }
    };

    window.setRouteStops = function (stops) {
      clearStopMarkers();
      if (originMarker) { originMarker.remove(); originMarker = null; }
      if (destMarker) { destMarker.remove(); destMarker = null; }
      (stops || []).forEach(function (stop, index, all) {
        var kind = index === 0 ? 'origin' : index === all.length - 1 ? 'stop-last' : 'stop';
        var marker = new maplibregl.Marker({ element: makeMarkerEl(kind, stop.letter) })
          .setLngLat([stop.longitude, stop.latitude])
          .addTo(map);
        stopMarkers.push(marker);
      });
    };

    window.setUserLocation = function (lng, lat, fly) {
      if (userMarker) { userMarker.remove(); userMarker = null; }
      if (lng == null || lat == null || !isFinite(lng) || !isFinite(lat)) return;
      var el = document.createElement('div');
      el.className = 'user-marker';
      userMarker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
      if (fly) {
        map.easeTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 17.4),
          duration: 800,
          essential: true
        });
      }
    };

    function lineCollection(lines) {
      return {
        type: 'FeatureCollection',
        features: (lines || []).filter(function (line) { return line && line.length >= 2; }).map(function (line) {
          return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } };
        })
      };
    }

    function removeRouteLayers() {
      ['route-line', 'route-casing', 'route-glow', 'walk-line', 'walk-casing'].forEach(function (id) {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      ['route', 'walk'].forEach(function (id) {
        if (map.getSource(id)) map.removeSource(id);
      });
    }

    function drawRouteLine() {
      var drive = lineCollection(routeDrive);
      var walk = lineCollection(routeWalk);
      if (!drive.features.length && !walk.features.length) {
        removeRouteLayers();
        return;
      }
      removeRouteLayers();
      var colors = palette();
      var walkColor = theme === 'night' ? '#2dd4bf' : '#0f766e';
      var bikeColor = theme === 'night' ? '#fb923c' : '#ea580c';
      var lineColor = routeBike ? bikeColor : colors.routeLine;
      if (drive.features.length) {
        map.addSource('route', { type: 'geojson', data: drive });
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': routeBike ? bikeColor : colors.routeGlow,
            'line-width': 16,
            'line-opacity': colors.routeGlowOpacity,
            'line-blur': 6
          }
        });
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': colors.routeCasing, 'line-width': 12, 'line-opacity': 0.95 }
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': lineColor, 'line-width': 5.5, 'line-opacity': 0.98 }
        });
      }
      if (walk.features.length) {
        map.addSource('walk', { type: 'geojson', data: walk });
        map.addLayer({
          id: 'walk-casing',
          type: 'line',
          source: 'walk',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': colors.routeCasing, 'line-width': 10, 'line-opacity': 0.95 }
        });
        map.addLayer({
          id: 'walk-line',
          type: 'line',
          source: 'walk',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': walkColor, 'line-width': 5, 'line-opacity': 0.98 }
        });
      }
    }

    function clearParkingMarker() {
      if (parkingMarker) {
        parkingMarker.remove();
        parkingMarker = null;
      }
    }

    window.clearRouteLine = function () {
      routeDrive = null;
      routeWalk = null;
      routeBike = false;
      clearParkingMarker();
      removeRouteLayers();
    };

    window.clearRoute = function () {
      if (originMarker) { originMarker.remove(); originMarker = null; }
      if (destMarker) { destMarker.remove(); destMarker = null; }
      clearStopMarkers();
      if (typeof window.setSelectedBuilding === 'function') window.setSelectedBuilding(null);
      if (typeof window.setSelectedSpace === 'function') window.setSelectedSpace(null);
      window.clearRouteLine();
    };

    window.setRouteLine = function (payload) {
      var drive = null;
      var walk = null;
      var parking = null;
      var bike = false;
      var moto = false;
      if (Array.isArray(payload)) {
        drive = payload.length >= 2 ? [payload] : null;
      } else if (payload) {
        drive = payload.drive && payload.drive.length ? payload.drive : null;
        walk = payload.walk && payload.walk.length ? payload.walk : null;
        parking = payload.parking || null;
        bike = payload.profile === 'cycling-regular';
        moto = payload.profile === 'driving-motorcycle';
        if (!drive && !walk && payload.coordinates && payload.coordinates.length >= 2) {
          drive = [payload.coordinates];
        }
      }
      var flat = [];
      (drive || []).concat(walk || []).forEach(function (line) {
        (line || []).forEach(function (point) { flat.push(point); });
      });
      if (flat.length < 2) {
        window.clearRouteLine();
        return;
      }
      routeDrive = drive;
      routeWalk = walk;
      routeBike = bike;
      if (!styleBusy) {
        drawRouteLine();
        if (campus) drawClosureLayers();
      }
      clearParkingMarker();
      if (parking && parking.point) {
        var el = document.createElement('div');
        el.className = bike
          ? 'route-marker parking bike'
          : (moto ? 'route-marker parking moto' : 'route-marker parking');
        if (bike) el.innerHTML = BIKE_SVG;
        else if (moto) el.innerHTML = MOTO_SVG;
        else el.textContent = 'P';
        parkingMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([parking.point.longitude, parking.point.latitude])
          .addTo(map);
      }
      var bounds = flat.reduce(function (b, c) {
        return b.extend(c);
      }, new maplibregl.LngLatBounds(flat[0], flat[0]));
      map.fitBounds(bounds, {
        padding: {
          top: 96,
          bottom: Math.min(chromeBottom + 24, Math.max(120, window.innerHeight - 220)),
          left: 36,
          right: 72
        },
        duration: 700,
        maxZoom: 18,
        pitch: map.getPitch(),
        bearing: map.getBearing()
      });
    };

    map.on('error', function (e) {
      post({ type: 'error', message: (e && e.error && e.error.message) || 'Error de mapa' });
    });

    function firstSymbolLayerId() {
      const layers = map.getStyle().layers || [];
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') return layers[i].id;
      }
      return undefined;
    }

    var M_LAT = 110540;
    var M_LON = 111320 * Math.cos((CONFIG.centerLat * Math.PI) / 180);
    var PX_PER_METER_Z0 = 1 / ((40075016.686 * Math.cos((CONFIG.centerLat * Math.PI) / 180)) / 512);

    function metersRadius(factor) {
      return [
        'interpolate', ['exponential', 2], ['zoom'],
        12, ['*', ['get', 'r'], factor * PX_PER_METER_Z0 * Math.pow(2, 12)],
        22, ['*', ['get', 'r'], factor * PX_PER_METER_Z0 * Math.pow(2, 22)]
      ];
    }

    function offsetLngLat(lon, lat, east, north) {
      return [lon + east / M_LON, lat + north / M_LAT];
    }

    function closeRing(ring) {
      ring.push(ring[0]);
      return ring;
    }

    function squareRing(lon, lat, size) {
      var h = size / 2;
      return closeRing([
        offsetLngLat(lon, lat, -h, -h),
        offsetLngLat(lon, lat, h, -h),
        offsetLngLat(lon, lat, h, h),
        offsetLngLat(lon, lat, -h, h)
      ]);
    }

    function boxRing(lon, lat, ax, ay, length, width) {
      var px = -ay, py = ax, hl = length / 2, hw = width / 2;
      return closeRing([[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(function (c) {
        return offsetLngLat(lon, lat, ax * c[0] + px * c[1], ay * c[0] + py * c[1]);
      }));
    }

    function ovalRing(lon, lat, ax, ay, length, width) {
      var px = -ay, py = ax, ring = [];
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * Math.PI * 2;
        var along = Math.cos(a) * (length / 2);
        var side = Math.sin(a) * (width / 2);
        ring.push(offsetLngLat(lon, lat, ax * along + px * side, ay * along + py * side));
      }
      return closeRing(ring);
    }

    function lampPart(ring, part, base, height, lit) {
      return {
        type: 'Feature',
        properties: { part: part, base: base, height: height, lit: lit },
        geometry: { type: 'Polygon', coordinates: [ring] }
      };
    }

    /** Rumbo (grados desde el norte) hacia el punto más cercano de algún camino. */
    function bearingToNearestPath(lon, lat) {
      var best = null;
      var bestD = Infinity;
      ((campus && campus.paths && campus.paths.features) || []).forEach(function (f) {
        var g = f.geometry;
        if (!g) return;
        var lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        lines.forEach(function (coords) {
          for (var i = 1; i < coords.length; i++) {
            var ax = (coords[i - 1][0] - lon) * M_LON, ay = (coords[i - 1][1] - lat) * M_LAT;
            var dx = (coords[i][0] - lon) * M_LON - ax, dy = (coords[i][1] - lat) * M_LAT - ay;
            var len2 = dx * dx + dy * dy;
            var t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
            var cx = ax + dx * t, cy = ay + dy * t;
            var d = cx * cx + cy * cy;
            if (d < bestD) { bestD = d; best = [cx, cy]; }
          }
        });
      });
      if (!best || bestD < 0.01) return 0;
      return (Math.atan2(best[0], best[1]) * 180) / Math.PI;
    }

    function addStreetLamp(models, glows, lon, lat, height, bearing, arms, radius, lit) {
      var spec = CONFIG.lampKinds.vial;
      var armRise = 1.1;
      var shaftH = Math.max(3, height - armRise);
      var rad = (bearing * Math.PI) / 180;
      models.push(lampPart(squareRing(lon, lat, 0.7), 'base', 0, 0.45, lit));
      models.push(lampPart(squareRing(lon, lat, 0.3), 'pole', 0.45, Math.min(3.2, shaftH), lit));
      models.push(lampPart(squareRing(lon, lat, 0.2), 'pole', Math.min(3.2, shaftH), shaftH + 0.1, lit));
      for (var arm = 0; arm < arms; arm++) {
        var sign = arm === 0 ? 1 : -1;
        var dirx = Math.sin(rad) * sign;
        var diry = Math.cos(rad) * sign;
        var prevX = 0, prevZ = shaftH;
        for (var i = 1; i <= 7; i++) {
          var ang = (i / 7) * (Math.PI / 2);
          var x = spec.reach * (1 - Math.cos(ang));
          var z = shaftH + armRise * Math.sin(ang);
          var mid = (prevX + x) / 2;
          var c = offsetLngLat(lon, lat, dirx * mid, diry * mid);
          models.push(lampPart(
            boxRing(c[0], c[1], dirx, diry, Math.max(0.22, x - prevX + 0.1), 0.12),
            'pole', Math.min(prevZ, z), Math.max(prevZ, z) + 0.1, lit
          ));
          prevX = x;
          prevZ = z;
        }
        var head = offsetLngLat(lon, lat, dirx * (spec.reach + 0.3), diry * (spec.reach + 0.3));
        models.push(lampPart(ovalRing(head[0], head[1], dirx, diry, 1.05, 0.46), 'bulb', prevZ - 0.22, prevZ - 0.02, lit));
        models.push(lampPart(ovalRing(head[0], head[1], dirx, diry, 1.2, 0.56), 'head', prevZ - 0.02, prevZ + 0.12, lit));
        if (lit) {
          glows.push({
            type: 'Feature',
            properties: { kind: 'vial', r: radius },
            geometry: { type: 'Point', coordinates: head }
          });
        }
      }
    }

    function addPathLamp(models, glows, lon, lat, height, radius, lit) {
      var h = Math.max(1.5, height);
      models.push(lampPart(squareRing(lon, lat, 0.46), 'base', 0, 0.3, lit));
      models.push(lampPart(squareRing(lon, lat, 0.14), 'pole', 0.3, h - 0.74, lit));
      models.push(lampPart(squareRing(lon, lat, 0.3), 'head', h - 0.79, h - 0.69, lit));
      models.push(lampPart(squareRing(lon, lat, 0.4), 'bulb', h - 0.69, h - 0.22, lit));
      models.push(lampPart(squareRing(lon, lat, 0.56), 'head', h - 0.22, h - 0.12, lit));
      models.push(lampPart(squareRing(lon, lat, 0.3), 'head', h - 0.12, h, lit));
      if (lit) {
        glows.push({
          type: 'Feature',
          properties: { kind: 'peatonal', r: radius },
          geometry: { type: 'Point', coordinates: [lon, lat] }
        });
      }
    }

    /** Modelos y luz a partir de los puntos de postes.json. Ningún poste se genera. */
    function buildLampData(collection) {
      var models = [];
      var glows = [];
      ((collection && collection.features) || []).forEach(function (feature) {
        var g = feature.geometry;
        if (!g || g.type !== 'Point') return;
        var lon = g.coordinates[0], lat = g.coordinates[1];
        if (!isFinite(lon) || !isFinite(lat)) return;
        var p = feature.properties || {};
        var kind = p.tipo === 'vial' ? 'vial' : 'peatonal';
        var spec = CONFIG.lampKinds[kind];
        var height = p.altura_m > 0 ? p.altura_m : spec.height;
        var radius = p.radio_m > 0 ? p.radio_m : spec.radius;
        var lit = p.estado !== 'dañado';
        if (kind === 'vial') {
          var bearing = typeof p.rumbo === 'number' && isFinite(p.rumbo) ? p.rumbo : bearingToNearestPath(lon, lat);
          addStreetLamp(models, glows, lon, lat, height, bearing, p.brazos === 2 ? 2 : 1, radius, lit);
        } else {
          addPathLamp(models, glows, lon, lat, height, radius, lit);
        }
      });
      return {
        glows: { type: 'FeatureCollection', features: glows },
        models: { type: 'FeatureCollection', features: models }
      };
    }

    var CAMPUS_LAYERS = [
      'tenis-icon', 'canchas-icon', 'motos-icon', 'bicis-icon', 'banos-icon', 'buildings-labels', 'espacios-label', 'lamp-bulb', 'lamp-3d', 'buildings-selected', 'buildings-3d',
      'buildings-footprint', 'buildings-hit', 'campus-building-3d',
      'lamp-core', 'lamp-glow', 'lamp-pool',
      'steps-line', 'foot-line', 'foot-casing', 'service-line', 'service-casing',
      'pasillos-line', 'pasillos-casing', 'espacios-line', 'espacios-fill'
    ];
    var CAMPUS_SOURCES = ['lamp-models', 'lamps', 'buildings', 'paths', 'pasillos', 'espacios'];

    /** Ajustes sobre el estilo base. Los ids cambian entre liberty y dark, por eso cada uno se protege. */
    function applyBaseTheme() {
      var colors = palette();
      colors.hide.forEach(function (id) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      });
      Object.keys(colors.base).forEach(function (id) {
        if (!map.getLayer(id)) return;
        var paint = colors.base[id];
        Object.keys(paint).forEach(function (prop) {
          try { map.setPaintProperty(id, prop, paint[prop]); } catch (e) {}
        });
      });
      map.setLight(colors.light);
      hideBasemapIcons();
    }

    /** Los íconos de baño y de cancha (POI pitch) del mapa base no coinciden con los nuestros. El estilo se recarga entero, así que el filtro no se acumula. */
    function hideBasemapIcons() {
      if (window.__hidBasemapIcons) return;
      var style = map.getStyle();
      if (!style || !style.layers) return;
      window.__hidBasemapIcons = true;
      var dropToilet = ['!=', ['coalesce', ['get', 'class'], ''], 'toilet'];
      var dropPitch = ['!=', ['coalesce', ['get', 'class'], ''], 'pitch'];
      style.layers.forEach(function (layer) {
        if (layer['source-layer'] !== 'poi') return;
        var current = null;
        try { current = map.getFilter(layer.id); } catch (e) { return; }
        try {
          map.setFilter(layer.id, current ? ['all', current, dropToilet, dropPitch] : ['all', dropToilet, dropPitch]);
        } catch (e) {}
      });
    }

    /** Material Icons round, 24x24. El mismo set que Icon (@expo/vector-icons/MaterialIcons). */
    var WC_GLYPH = 'M5.5 21v-6.5H5c-.55 0-1-.45-1-1V9c0-1.1.9-2 2-2h3c1.1 0 2 .9 2 2v4.5c0 .55-.45 1-1 1h-.5V21c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1zM18 21v-5h1.61c.68 0 1.16-.67.95-1.32l-2.1-6.31C18.18 7.55 17.42 7 16.56 7h-.12c-.86 0-1.63.55-1.9 1.37l-2.1 6.31c-.22.65.26 1.32.95 1.32H15v5c0 .55.45 1 1 1h1c.55 0 1-.45 1-1zM7.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm9 0c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2z';
    var BIKE_GLYPH = 'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.06 1.06 2.38 1.78 3.96 2.02.6.09 1.14-.39 1.14-1 0-.49-.37-.91-.85-.99-1.11-.18-2.02-.71-2.75-1.43l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v4c0 .55.45 1 1 1s1-.45 1-1v-4.4c0-.52-.2-1.01-.55-1.38L10.8 10.5zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z';
    var MOTO_GLYPH = 'M20 11c-.18 0-.36.03-.53.05L17.41 9H20V6l-3.72 1.86L13.41 5H9v2h3.59l2 2H11l-4 2-2-2H0v2h4c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4l2 2h3l3.49-6.1 1.01 1.01c-.91.73-1.5 1.84-1.5 3.09 0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4zM4 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm16 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z';
    var SOCCER_GLYPH = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 3.3 1.35-.95a8.01 8.01 0 0 1 4.38 3.34l-.39 1.34-1.35.46L13 6.7V5.3zm-3.35-.95L11 5.3v1.4L7.01 9.49l-1.35-.46-.39-1.34a8.103 8.103 0 0 1 4.38-3.34zM7.08 17.11l-1.14.1A7.938 7.938 0 0 1 4 12c0-.12.01-.23.02-.35l1-.73 1.38.48 1.46 4.34-.78 1.37zm7.42 2.48c-.79.26-1.63.41-2.5.41s-1.71-.15-2.5-.41l-.69-1.49.64-1.1h5.11l.64 1.11-.7 1.48zM14.27 15H9.73l-1.35-4.02L12 8.44l3.63 2.54L14.27 15zm3.79 2.21-1.14-.1-.79-1.37 1.46-4.34 1.39-.47 1 .73c.01.11.02.22.02.34 0 1.99-.73 3.81-1.94 5.21z';
    var TENNIS_GLYPH = 'M19.52 2.49C17.18.15 12.9.62 9.97 3.55c-1.6 1.6-2.52 3.87-2.54 5.46-.02 1.58.26 3.89-1.35 5.5l-4.24 4.24 1.42 1.42 4.24-4.24c1.61-1.61 3.92-1.33 5.5-1.35s3.86-.94 5.46-2.54c2.92-2.93 3.4-7.21 1.06-9.55zm-9.2 9.19c-1.53-1.53-1.05-4.61 1.06-6.72s5.18-2.59 6.72-1.06c1.53 1.53 1.05 4.61-1.06 6.72s-5.18 2.59-6.72 1.06zM18 17c.53 0 1.04.21 1.41.59.78.78.78 2.05 0 2.83-.37.37-.88.58-1.41.58s-1.04-.21-1.41-.59c-.78-.78-.78-2.05 0-2.83.37-.37.88-.58 1.41-.58m0-2a3.998 3.998 0 0 0-2.83 6.83c.78.78 1.81 1.17 2.83 1.17a3.998 3.998 0 0 0 2.83-6.83A3.998 3.998 0 0 0 18 15z';

    /** Circulo con el glifo en blanco. El mapa es un canvas y no puede montar el componente Icon. */
    function drawMarkBadge(imageId, topColor, bottomColor, drawGlyph) {
      if (map.hasImage(imageId)) return;
      var size = 160;
      var cx = 80;
      var cy = 76;
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');

      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.32)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      var fill = ctx.createLinearGradient(0, cy - 50, 0, cy + 50);
      fill.addColorStop(0, topColor);
      fill.addColorStop(1, bottomColor);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, 50, 0, Math.PI * 2);
      ctx.fill();

      drawGlyph(ctx, cx, cy);

      map.addImage(imageId, ctx.getImageData(0, 0, size, size), { pixelRatio: 4 });
    }

    function ensureMarkIcon(imageId, glyph, scale, colors) {
      drawMarkBadge(imageId, colors ? colors[0] : '#3a9bf4', colors ? colors[1] : '#1673d6', function (ctx, cx, cy) {
        ctx.save();
        ctx.translate(cx - 12 * scale, cy - 12 * scale);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffffff';
        ctx.fill(new Path2D(glyph));
        ctx.restore();
      });
    }

    /** Distintivo de vía cerrada: anillo y diagonal de prohibido, en el color del estado. */
    function ensureClosureMarkIcon(imageId, topColor, bottomColor) {
      drawMarkBadge(imageId, topColor, bottomColor, function (ctx, cx, cy) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, 21, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy - 15);
        ctx.lineTo(cx + 15, cy + 15);
        ctx.stroke();
        ctx.restore();
      });
    }

    function addCampusLayers() {
      if (!campus) return;
      var colors = palette();
      var night = theme === 'night';
      var lamps = colors.lamps && lampData && lampData.models.features.length ? colors.lamps : null;

      CAMPUS_LAYERS.forEach(function (id) {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      CAMPUS_SOURCES.forEach(function (id) {
        if (map.getSource(id)) map.removeSource(id);
      });

      const beforeId = firstSymbolLayerId();
      var spaces = campus.spaces;
      if (spaces && spaces.features && spaces.features.length) {
        map.addSource('espacios', { type: 'geojson', data: spaces, promoteId: 'id' });
        map.addLayer({
          id: 'espacios-fill', type: 'fill', source: 'espacios',
          filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              colors.selected,
              ['==', ['get', 'tipo'], 'cancha'],
              colors.canchaFill,
              colors.spaceFill
            ],
            'fill-opacity': colors.spaceFillOpacity
          }
        }, beforeId);
        map.addLayer({
          id: 'espacios-line', type: 'line', source: 'espacios',
          filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
          layout: { 'line-join': 'round' },
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              colors.selected,
              colors.spaceLine
            ],
            // Las canchas van sin borde: solo relleno verde e icono.
            'line-opacity': ['case', ['==', ['get', 'tipo'], 'cancha'], 0, 1],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              15, ['case', ['boolean', ['feature-state', 'selected'], false], 2.4, 1.2],
              17, ['case', ['boolean', ['feature-state', 'selected'], false], 3.4, 1.8],
              19, ['case', ['boolean', ['feature-state', 'selected'], false], 4.2, 2.4]
            ]
          }
        }, beforeId);
        map.addLayer({
          id: 'espacios-label', type: 'symbol', source: 'espacios',
          filter: ['match', ['get', 'tipo'], ['bano', 'parqueadero_bici', 'parqueadero_moto', 'cancha'], false, true],
          minzoom: 16,
          layout: {
            'text-field': ['coalesce', ['get', 'etiqueta'], ['get', 'nombre'], ''],
            'text-font': ['Noto Sans Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 16, 11, 18, 14],
            'text-anchor': 'center',
            'text-allow-overlap': true
          },
          paint: {
            'text-color': colors.label,
            'text-halo-color': colors.labelHalo,
            'text-halo-width': 1.5
          }
        }, beforeId);
      }

      const serviceFilter = ['==', ['get', 'highway'], 'service'];
      const footFilter = ['match', ['get', 'highway'], ['footway', 'path', 'pedestrian', 'bridleway'], true, false];
      const stepsFilter = ['==', ['get', 'highway'], 'steps'];

      map.addSource('paths', { type: 'geojson', data: campus.paths });
      map.addLayer({
        id: 'service-casing', type: 'line', source: 'paths',
        filter: serviceFilter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': colors.serviceCasing,
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2.4, 17, 5.2, 19, 8.5]
        }
      }, beforeId);
      map.addLayer({
        id: 'service-line', type: 'line', source: 'paths',
        filter: serviceFilter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': colors.serviceLine,
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.4, 17, 3.4, 19, 6]
        }
      }, beforeId);
      var footCasingPaint = {
        'line-color': colors.footCasing,
        'line-width': colors.footDashedCasing
          ? ['interpolate', ['linear'], ['zoom'], 15, 1.8, 17, 3.0, 19, 4.0]
          : ['interpolate', ['linear'], ['zoom'], 15, 1.8, 17, 3.4, 19, 5.0],
        'line-opacity': colors.footCasingOpacity
      };
      if (colors.footDashedCasing) footCasingPaint['line-dasharray'] = [2, 1.5];
      map.addLayer({
        id: 'foot-casing', type: 'line', source: 'paths',
        filter: footFilter,
        layout: { 'line-cap': colors.footDashedCasing ? 'butt' : 'round', 'line-join': 'round' },
        paint: footCasingPaint
      }, beforeId);
      map.addLayer({
        id: 'foot-line', type: 'line', source: 'paths',
        filter: footFilter,
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': colors.footLine,
          'line-dasharray': [2, 1.5],
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.2, 17, 2.2, 19, 3.0],
          'line-opacity': 0.98
        }
      }, beforeId);
      map.addLayer({
        id: 'steps-line', type: 'line', source: 'paths',
        filter: stepsFilter,
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': colors.steps,
          'line-dasharray': [0.5, 0.4],
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.6, 17, 2.6, 19, 3.4]
        }
      }, beforeId);

      if (lamps && lampData.glows.features.length) {
        map.addSource('lamps', { type: 'geojson', data: lampData.glows });
        map.addLayer({
          id: 'lamp-pool', type: 'circle', source: 'lamps',
          paint: {
            'circle-radius': metersRadius(1),
            'circle-color': ['match', ['get', 'kind'], 'vial', lamps.poolVial, lamps.poolPeatonal],
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.18, 17, 0.36],
            'circle-blur': 1,
            'circle-pitch-alignment': 'map',
            'circle-pitch-scale': 'map'
          }
        }, beforeId);
        map.addLayer({
          id: 'lamp-glow', type: 'circle', source: 'lamps',
          paint: {
            'circle-radius': metersRadius(0.5),
            'circle-color': lamps.glow,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.24, 17, 0.4],
            'circle-blur': 0.9,
            'circle-pitch-alignment': 'map',
            'circle-pitch-scale': 'map'
          }
        }, beforeId);
        map.addLayer({
          id: 'lamp-core', type: 'circle', source: 'lamps',
          minzoom: 15,
          paint: {
            'circle-radius': metersRadius(0.2),
            'circle-color': lamps.core,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.7, 17, 0.5],
            'circle-blur': 0.7,
            'circle-pitch-alignment': 'map',
            'circle-pitch-scale': 'map'
          }
        }, beforeId);
      }

      if (!map.getLayer('building-3d') && map.getSource('openmaptiles')) {
        var ramp = colors.baseBuildingRamp;
        var rampColor = ramp.length === 1
          ? ramp[0][1]
          : ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6]].concat(
              ramp.reduce(function (acc, stop) { return acc.concat(stop); }, [])
            );
        map.addLayer({
          id: 'campus-building-3d',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,
          filter: ['all',
            ['!=', ['get', 'hide_3d'], true],
            ['>', ['coalesce', ['get', 'render_height'], 0], 0]
          ],
          paint: {
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-color': rampColor,
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
            'fill-extrusion-opacity': 1,
            'fill-extrusion-vertical-gradient': colors.buildingGradient
          }
        }, beforeId);
      }

      var tones = colors.buildings;
      map.addSource('buildings', { type: 'geojson', data: campus.buildings, promoteId: 'fid' });
      map.addLayer({
        id: 'buildings-hit', type: 'fill', source: 'buildings',
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.01 }
      }, beforeId);
      map.addLayer({
        id: 'buildings-footprint', type: 'fill', source: 'buildings',
        filter: ['>', ['coalesce', ['get', 'height_m'], 0], 0],
        paint: {
          'fill-color': colors.footprint,
          'fill-opacity': colors.footprintOpacity,
          'fill-translate': [2, 4]
        }
      }, beforeId);
      map.addLayer({
        id: 'buildings-3d', type: 'fill-extrusion', source: 'buildings',
        filter: ['>', ['coalesce', ['get', 'height_m'], 0], 0],
        paint: {
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            colors.selected,
            [
              'match', ['get', 'tone'],
              'library', tones.library,
              'food', tones.food,
              'culture', tones.culture,
              'sport', tones.sport,
              'tower', tones.tower,
              'mid', tones.mid,
              tones.stone
            ]
          ],
          'fill-extrusion-height': ['get', 'height_m'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': colors.buildingOpacity,
          'fill-extrusion-vertical-gradient': colors.buildingGradient
        }
      }, beforeId);
      map.addLayer({
        id: 'buildings-selected', type: 'line', source: 'buildings',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': colors.selected,
          'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 17, 2.5, 19, 3.5],
          'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], night ? 1 : 0.9, 0]
        }
      }, beforeId);

      if (lamps) {
        map.addSource('lamp-models', { type: 'geojson', data: lampData.models });
        map.addLayer({
          id: 'lamp-3d', type: 'fill-extrusion', source: 'lamp-models',
          minzoom: 16.5,
          filter: ['!=', ['get', 'part'], 'bulb'],
          paint: {
            'fill-extrusion-color': ['match', ['get', 'part'], 'head', lamps.head, lamps.metal],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-opacity': 1,
            'fill-extrusion-vertical-gradient': true
          }
        }, beforeId);
        map.addLayer({
          id: 'lamp-bulb', type: 'fill-extrusion', source: 'lamp-models',
          minzoom: 16.5,
          filter: ['==', ['get', 'part'], 'bulb'],
          paint: {
            'fill-extrusion-color': ['case', ['boolean', ['get', 'lit'], true], lamps.bulb, lamps.bulbOff],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-opacity': 1,
            'fill-extrusion-vertical-gradient': false
          }
        }, beforeId);
      }

      map.addLayer({
        id: 'buildings-labels', type: 'symbol', source: 'buildings',
        minzoom: 16.2,
        layout: {
          'text-field': ['coalesce', ['get', 'label'], ''],
          'text-font': ['Noto Sans Bold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            16.2, 10,
            18, 12.5
          ],
          'text-anchor': 'center',
          'text-max-width': 8,
          'text-allow-overlap': false,
          'symbol-sort-key': ['*', -1, ['coalesce', ['get', 'height_m'], 0]]
        },
        paint: {
          'text-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            colors.labelSelected,
            colors.label
          ],
          'text-halo-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            colors.labelSelectedHalo,
            colors.labelHalo
          ],
          'text-halo-width': 1.5
        }
      });

      var passages = campus.passages;
      if (passages && passages.features && passages.features.length) {
        map.addSource('pasillos', { type: 'geojson', data: passages });
        map.addLayer({
          id: 'pasillos-casing', type: 'line', source: 'pasillos',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': colors.passageCasing,
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              15, 4.5,
              17, 6,
              19, 7.5
            ],
            'line-opacity': 0.92
          }
        });
        map.addLayer({
          id: 'pasillos-line', type: 'line', source: 'pasillos',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': colors.passageLine,
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              15, 2.4,
              17, 3.4,
              19, 4.2
            ],
            'line-opacity': 0.95
          }
        });
      }

      if (map.getSource('espacios')) {
        ensureMarkIcon('bano-mark', WC_GLYPH, 3);
        ensureMarkIcon('bici-mark', BIKE_GLYPH, 2.6);
        ensureMarkIcon('moto-mark', MOTO_GLYPH, 2.6);
        ensureMarkIcon('cancha-mark', SOCCER_GLYPH, 2.7, ['#8fa16b', '#66784a']);
        ensureMarkIcon('tenis-mark', TENNIS_GLYPH, 2.7, ['#8fa16b', '#66784a']);
        var spaceIconLayout = {
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15.6, 0.8, 17, 0.95, 19, 1.1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'center',
          'icon-pitch-alignment': 'viewport'
        };
        map.addLayer({
          id: 'banos-icon', type: 'symbol', source: 'espacios',
          filter: ['==', ['get', 'tipo'], 'bano'],
          minzoom: 15.6,
          layout: Object.assign({ 'icon-image': 'bano-mark' }, spaceIconLayout)
        });
        map.addLayer({
          id: 'bicis-icon', type: 'symbol', source: 'espacios',
          filter: ['==', ['get', 'tipo'], 'parqueadero_bici'],
          minzoom: 15.6,
          layout: Object.assign({ 'icon-image': 'bici-mark' }, spaceIconLayout)
        });
        map.addLayer({
          id: 'motos-icon', type: 'symbol', source: 'espacios',
          filter: ['==', ['get', 'tipo'], 'parqueadero_moto'],
          minzoom: 15.6,
          layout: Object.assign({ 'icon-image': 'moto-mark' }, spaceIconLayout)
        });
        /** Distintivo propio de cancha (verde, como su relleno) con el código debajo. Sin esto el mapa base pintaba su POI pitch genérico. */
        var canchaIconLayout = Object.assign({}, spaceIconLayout, {
          'text-field': ['coalesce', ['get', 'etiqueta'], ['get', 'nombre'], ''],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 16, 11, 18, 14],
          'text-anchor': 'top',
          'text-offset': [0, 1.7],
          'text-allow-overlap': true,
          'text-ignore-placement': true
        });
        var canchaIconPaint = {
          'text-color': colors.label,
          'text-halo-color': colors.labelHalo,
          'text-halo-width': 1.5
        };
        map.addLayer({
          id: 'canchas-icon', type: 'symbol', source: 'espacios',
          filter: ['all', ['==', ['get', 'tipo'], 'cancha'], ['!=', ['get', 'id'], 'c21']],
          minzoom: 15.6,
          layout: Object.assign({ 'icon-image': 'cancha-mark' }, canchaIconLayout),
          paint: canchaIconPaint
        });
        map.addLayer({
          id: 'tenis-icon', type: 'symbol', source: 'espacios',
          filter: ['all', ['==', ['get', 'tipo'], 'cancha'], ['==', ['get', 'id'], 'c21']],
          minzoom: 15.6,
          layout: Object.assign({ 'icon-image': 'tenis-mark' }, canchaIconLayout),
          paint: canchaIconPaint
        });
      }

      if (selectedBuildingId != null) {
        try {
          map.setFeatureState({ source: 'buildings', id: selectedBuildingId }, { selected: true });
        } catch (e) {}
      }
      if (selectedSpaceId != null) {
        try {
          map.setFeatureState({ source: 'espacios', id: selectedSpaceId }, { selected: true });
        } catch (e) {}
      }

      drawRouteLine();
      drawClosureLayers();
    }

    function revealMap() {
      if (!styleBusy) veil.classList.remove('on');
    }

    function finishThemeChange() {
      styleBusy = false;
      post({ type: 'theme-ready', theme: theme });
      var fallback = setTimeout(revealMap, 1200);
      map.once('idle', function () {
        clearTimeout(fallback);
        revealMap();
      });
      if (pendingTheme) {
        var next = pendingTheme;
        pendingTheme = null;
        window.setMapTheme(next);
      }
    }

    var EMPTY_FC = { type: 'FeatureCollection', features: [] };
    var closureData = EMPTY_FC;
    var closureDraft = EMPTY_FC;
    var CLOSURE_LAYERS = [
      'closures-draft', 'closures-confirmed-icon', 'closures-provisional-icon', 'closures-hit',
      'closures-confirmed-cut', 'closures-confirmed', 'closures-provisional', 'closures-candidate'
    ];

    /** Punto medio de un tramo, caminando la mitad de su longitud. Ahí va el icono del cierre. */
    function segmentMidpoint(coords) {
      var total = 0;
      var lengths = [];
      for (var i = 1; i < coords.length; i++) {
        var dx = coords[i][0] - coords[i - 1][0];
        var dy = coords[i][1] - coords[i - 1][1];
        var length = Math.sqrt(dx * dx + dy * dy);
        lengths.push(length);
        total += length;
      }
      var half = total / 2;
      for (var j = 0; j < lengths.length; j++) {
        if (half <= lengths[j]) {
          var share = lengths[j] === 0 ? 0 : half / lengths[j];
          return [
            coords[j][0] + (coords[j + 1][0] - coords[j][0]) * share,
            coords[j][1] + (coords[j + 1][1] - coords[j][1]) * share
          ];
        }
        half -= lengths[j];
      }
      return coords[coords.length - 1];
    }

    /** Un punto por tramo en ámbar o rojo. El candidato (gris) no lleva icono. */
    function closureIconData() {
      var features = [];
      (closureData.features || []).forEach(function (feature) {
        var status = (feature.properties || {}).status;
        if (status !== 'provisional' && status !== 'confirmed') return;
        var coords = feature.geometry && feature.geometry.coordinates;
        if (!coords || coords.length < 2) return;
        features.push({
          type: 'Feature',
          properties: { closureId: (feature.properties || {}).closureId, status: status },
          geometry: { type: 'Point', coordinates: segmentMidpoint(coords) }
        });
      });
      return { type: 'FeatureCollection', features: features };
    }

    /** Cierres arriba de la ruta: se tienen que ver aunque la ruta pase al lado. */
    function drawClosureLayers() {
      CLOSURE_LAYERS.forEach(function (id) {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      ['closures', 'closures-draft', 'closures-icons'].forEach(function (id) {
        if (map.getSource(id)) map.removeSource(id);
      });
      map.addSource('closures', { type: 'geojson', data: closureData });
      map.addSource('closures-draft', { type: 'geojson', data: closureDraft });
      map.addSource('closures-icons', { type: 'geojson', data: closureIconData() });
      var lineLayout = { 'line-cap': 'round', 'line-join': 'round' };
      map.addLayer({
        id: 'closures-candidate', type: 'line', source: 'closures',
        filter: ['==', ['get', 'status'], 'candidate'],
        layout: lineLayout,
        paint: { 'line-color': '#8e8e93', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [1, 1.4] }
      });
      map.addLayer({
        id: 'closures-provisional', type: 'line', source: 'closures',
        filter: ['==', ['get', 'status'], 'provisional'],
        layout: lineLayout,
        paint: { 'line-color': '#f59e0b', 'line-width': 6.5, 'line-opacity': 0.95, 'line-dasharray': [1.2, 1] }
      });
      map.addLayer({
        id: 'closures-confirmed', type: 'line', source: 'closures',
        filter: ['==', ['get', 'status'], 'confirmed'],
        layout: lineLayout,
        paint: { 'line-color': '#dc2626', 'line-width': 7.5, 'line-opacity': 0.95 }
      });
      map.addLayer({
        id: 'closures-confirmed-cut', type: 'line', source: 'closures',
        filter: ['==', ['get', 'status'], 'confirmed'],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7.5, 'line-dasharray': [0.25, 2.2] }
      });
      map.addLayer({
        id: 'closures-hit', type: 'line', source: 'closures',
        paint: { 'line-color': '#000000', 'line-width': 24, 'line-opacity': 0 }
      });
      ensureClosureMarkIcon('closure-provisional-mark', '#fbbf24', '#d97706');
      ensureClosureMarkIcon('closure-confirmed-mark', '#f87171', '#b91c1c');
      var closureIconLayout = {
        'icon-size': ['interpolate', ['linear'], ['zoom'], 15.6, 0.65, 17, 0.82, 19, 1],
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'icon-anchor': 'center',
        'icon-pitch-alignment': 'viewport'
      };
      map.addLayer({
        id: 'closures-provisional-icon', type: 'symbol', source: 'closures-icons',
        filter: ['==', ['get', 'status'], 'provisional'],
        minzoom: 15.6,
        layout: Object.assign({ 'icon-image': 'closure-provisional-mark' }, closureIconLayout)
      });
      map.addLayer({
        id: 'closures-confirmed-icon', type: 'symbol', source: 'closures-icons',
        filter: ['==', ['get', 'status'], 'confirmed'],
        minzoom: 15.6,
        layout: Object.assign({ 'icon-image': 'closure-confirmed-mark' }, closureIconLayout)
      });
      map.addLayer({
        id: 'closures-draft', type: 'line', source: 'closures-draft',
        layout: lineLayout,
        paint: { 'line-color': '#2563eb', 'line-width': 8, 'line-opacity': 0.9 }
      });
    }

    window.setClosures = function (fc) {
      closureData = fc && fc.features ? fc : EMPTY_FC;
      if (!styleBusy && campus) drawClosureLayers();
    };

    window.setClosureDraft = function (fc) {
      closureDraft = fc && fc.features ? fc : EMPTY_FC;
      if (!styleBusy && campus) drawClosureLayers();
    };

    map.on('style.load', function () {
      window.__hidBasemapIcons = false;
      applyBaseTheme();
      addCampusLayers();
      finishThemeChange();
    });

    /** setStyle borra fuentes y capas propias; style.load las vuelve a poner desde window.__campus. */
    window.setMapTheme = function (next) {
      if (!CONFIG.styles[next]) return;
      if (styleBusy) {
        pendingTheme = next;
        return;
      }
      if (next === theme) {
        post({ type: 'theme-ready', theme: theme });
        return;
      }
      styleBusy = true;
      theme = next;
      veil.style.background = CONFIG.backdrops[next];
      veil.classList.add('on');
      setTimeout(function () {
        document.documentElement.dataset.theme = theme;
        document.body.dataset.theme = theme;
        map.setStyle(CONFIG.styles[theme], { diff: false });
      }, 180);
    };

    window.loadCampusLayers = function (buildings, paths, passages, lamps, spaces) {
      campus = {
        buildings: buildings,
        paths: paths,
        passages: passages,
        lamps: lamps || { type: 'FeatureCollection', features: [] },
        spaces: spaces || { type: 'FeatureCollection', features: [] }
      };
      window.__campus = campus;
      lampData = buildLampData(campus.lamps);
      if (!styleBusy) addCampusLayers();

      if (!cameraFitted) {
        cameraFitted = true;
        map.fitBounds(
          [[${CAMPUS_BOUNDS.minLon}, ${CAMPUS_BOUNDS.minLat}], [${CAMPUS_BOUNDS.maxLon}, ${CAMPUS_BOUNDS.maxLat}]],
          { padding: 48, pitch: 58, bearing: -28, duration: 900 }
        );
      }

      post({ type: 'ready' });
    };

    map.on('click', function (e) {
      if (Date.now() < suppressMapClickUntil) return;
      var pad = 12;
      var bbox = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
      var hitLayers = [];
      if (map.getLayer('buildings-hit')) hitLayers.push('buildings-hit');
      if (map.getLayer('buildings-3d')) hitLayers.push('buildings-3d');
      var building = hitLayers.length
        ? map.queryRenderedFeatures(bbox, { layers: hitLayers })[0]
        : null;
      var bathroomEdificio = null;
      var bathroomSpaceId = null;
      if (map.getLayer('banos-icon')) {
        var icons = map.queryRenderedFeatures(bbox, { layers: ['banos-icon'] });
        for (var li = 0; li < icons.length; li++) {
          var iconProps = icons[li].properties || {};
          if (iconProps.edificio) {
            bathroomEdificio = String(iconProps.edificio);
            bathroomSpaceId = iconProps.id || null;
            break;
          }
        }
      }
      var bikeSpaceId = null;
      if (!bathroomEdificio && map.getLayer('bicis-icon')) {
        var bikes = map.queryRenderedFeatures(bbox, { layers: ['bicis-icon'] });
        if (bikes.length) bikeSpaceId = (bikes[0].properties || {}).id || null;
      }
      var motoSpaceId = null;
      if (!bathroomEdificio && !bikeSpaceId && map.getLayer('motos-icon')) {
        var motos = map.queryRenderedFeatures(bbox, { layers: ['motos-icon'] });
        if (motos.length) motoSpaceId = (motos[0].properties || {}).id || null;
      }
      var space = null;
      if (!bathroomEdificio && !bikeSpaceId && !motoSpaceId && !building && map.getLayer('espacios-fill')) {
        space = map.queryRenderedFeatures(bbox, { layers: ['espacios-fill'] })[0] || null;
      }
      var iconSpaceId = bikeSpaceId || motoSpaceId;
      var closureId = null;
      var closureHitLayers = ['closures-confirmed-icon', 'closures-provisional-icon', 'closures-hit']
        .filter(function (id) { return map.getLayer(id); });
      if (closureHitLayers.length) {
        var closureHits = map.queryRenderedFeatures(bbox, { layers: closureHitLayers });
        if (closureHits.length) closureId = (closureHits[0].properties || {}).closureId || null;
      }
      post({
        type: 'map-click',
        longitude: e.lngLat.lng,
        latitude: e.lngLat.lat,
        closureId: closureId,
        building: bathroomEdificio || iconSpaceId ? null : (building ? (building.properties || null) : null),
        spaceId: bathroomEdificio
          ? bathroomSpaceId
          : (iconSpaceId || (space && space.properties ? (space.properties.id || null) : null)),
        bathroomEdificio: bathroomEdificio
      });
    });

    map.on('load', function () {
      post({ type: 'map-ready' });
    });
  </script>
</body>
</html>`;
}

export function CampusMap() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const webRef = useRef<WebView>(null);
  const [status, setStatus] = useState("Cargando mapa…");
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [originName, setOriginName] = useState<string | null>(null);
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [route, setRoute] = useState<HybridRouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const {
    panel: tab,
    setPanel: setTab,
    registerSelectMapTab,
    openPlaceDetails,
    setProfileOpen,
  } = useMapPanel();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const { closures, myVotes, report: reportClosureNow, vote: voteClosureNow } = useCampusClosures(userId);
  const [reportMode, setReportMode] = useState(false);
  const [reportPanelHeight, setReportPanelHeight] = useState(0);
  const [draftKeys, setDraftKeys] = useState<SegmentKey[]>([]);
  const [reportHint, setReportHint] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [closureOverride, setClosureOverride] = useState<ClosureOverride>(null);
  const [routeIsolated, setRouteIsolated] = useState(false);
  const [promptedIds, setPromptedIds] = useState<Set<number>>(new Set());
  const reportedRef = useRef(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const [pickingSlot, setPickingSlot] = useState<RouteSlot | null>(null);
  const [pendingPreset, setPendingPreset] = useState<PresetRoute | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [mockLocationActive, setMockLocationActive] = useState(false);
  const [activeSlot, setActiveSlot] = useState<RouteSlot>("origin");
  const [view3d, setView3d] = useState(true);
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [catalog, setCatalog] = useState<CampusCatalog | null>(null);
  const [preset, setPreset] = useState<{ name: string; stops: { letter: string; name: string }[] } | null>(null);
  const [locating, setLocating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [userOutsideCampus, setUserOutsideCampus] = useState(false);
  const [streetProfile, setStreetProfile] = useState<StreetProfile>("foot-walking");
  const [nightChoiceOpen, setNightChoiceOpen] = useState(false);
  const { mode: themeMode, theme: mapTheme, initialTheme, setMode: setThemeMode } = useMapTheme();
  const [appliedTheme, setAppliedTheme] = useState(mapTheme);
  const [dayRecalc, setDayRecalc] = useState<{ from: LatLng; to: LatLng } | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const webThemeRef = useRef<MapTheme | null>(null);
  const activeSlotRef = useRef<RouteSlot>(activeSlot);
  const tabRef = useRef<MapPanel>(tab);
  const chromeBottomRef = useRef(220);
  const searchSlotRef = useRef<RouteSlot | null>("destination");
  const originPlaceRef = useRef<CampusDestination | null>(null);
  const destinationPlaceRef = useRef<CampusDestination | null>(null);
  const inTripRef = useRef(false);
  const pendingPresetRef = useRef<PresetRoute | null>(null);
  const selectedRef = useRef<SelectedPlace | null>(null);
  const routeRequestRef = useRef(0);
  const streetProfileRef = useRef<StreetProfile>(streetProfile);
  const userLocationRef = useRef<LatLng | null>(null);
  const userOutsideCampusRef = useRef(false);
  const mockLocationActiveRef = useRef(false);
  const assistantRequestRef = useRef(0);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    pendingPresetRef.current = pendingPreset;
  }, [pendingPreset]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    streetProfileRef.current = streetProfile;
  }, [streetProfile]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    userOutsideCampusRef.current = userOutsideCampus;
  }, [userOutsideCampus]);

  useEffect(() => {
    mockLocationActiveRef.current = mockLocationActive;
  }, [mockLocationActive]);

  const position = useEffectivePosition({
    manualPoint: origin,
    mockPoint: mockLocationActive ? userLocation : null,
  });

  const baseImpact = useMemo(() => closureImpact(closures), [closures]);
  const baseSignature = impactSignature(baseImpact);
  const overrideSignature = closureOverride
    ? closureOverride.kind === "relaxed"
      ? "relaxed"
      : `avoid:${closureOverride.keys.join(",")}`
    : "";
  const effectiveImpact = useMemo(() => {
    if (!closureOverride) return baseImpact;
    if (closureOverride.kind === "relaxed") return relaxImpact(baseImpact);
    return avoidSegments(baseImpact, closureOverride.keys);
    // Solo cambia si cambian los tramos, no cada vez que llega la misma lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSignature, overrideSignature]);
  const effectiveImpactRef = useRef(effectiveImpact);
  const baseImpactRef = useRef(baseImpact);
  useEffect(() => {
    effectiveImpactRef.current = effectiveImpact;
    baseImpactRef.current = baseImpact;
  }, [effectiveImpact, baseImpact]);
  const lastRouteRef = useRef<{
    from: LatLng;
    to: LatLng;
    profile: StreetProfile;
    walkCost?: WalkCost;
  } | null>(null);

  useEffect(() => {
    setClosureImpact(effectiveImpact);
  }, [effectiveImpact]);

  useEffect(() => {
    let cancelled = false;
    void recentlyPromptedClosures(userId).then((ids) => {
      if (!cancelled) setPromptedIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const html = useMemo(() => (initialTheme ? buildMapHtml(initialTheme) : null), [initialTheme]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await readCachedCatalog();
      if (!cancelled && cached) setCatalog(cached);
      try {
        const fresh = await refreshCatalog();
        if (!cancelled && fresh) setCatalog(fresh);
      } catch {
        // Sin red se queda el último catálogo guardado.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildings = useMemo(
    () => withExtrusionHeight(edificios as unknown as GeoJsonFeatureCollection, catalog),
    [catalog],
  );
  const paths = useMemo(() => aristasRed, []);
  const passages = useMemo(() => pasillos, []);
  const lamps = useMemo(() => campusLampPosts(), []);
  const spaces = useMemo(() => espacios, []);
  const destinations = useMemo(
    () => listDestinations(edificios as unknown as GeoJsonFeatureCollection, catalog),
    [catalog],
  );
  const placeCatalog = useMemo(() => buildPlaceCatalog(destinations), [destinations]);
  const results = useMemo(() => searchDestinations(destinations, query, 8), [destinations, query]);

  const inject = useCallback((code: string) => {
    webRef.current?.injectJavaScript(`(function(){${code}; true;})();`);
  }, []);

  useEffect(() => {
    const destination = selected?.destination;
    const fid = destination?.kind === "building" ? destination.building?.fid : null;
    const buildingValue = fid == null || Number.isNaN(Number(fid)) ? "null" : String(Number(fid));
    const spaceValue =
      destination?.kind === "space" && destination.spaceId ? JSON.stringify(destination.spaceId) : "null";
    inject(
      `if (typeof window.setSelectedBuilding === 'function') window.setSelectedBuilding(${buildingValue});
       if (typeof window.setSelectedSpace === 'function') window.setSelectedSpace(${spaceValue});`,
    );
  }, [selected, inject]);

  const injectLayers = useCallback(() => {
    const payload = JSON.stringify({ buildings, paths, passages, lamps, spaces });
    inject(`
      try {
        var data = ${payload};
        if (typeof window.loadCampusLayers === 'function') {
          window.loadCampusLayers(data.buildings, data.paths, data.passages, data.lamps, data.spaces);
        }
      } catch (e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
        }
      }
    `);
  }, [buildings, paths, passages, lamps, spaces, inject]);

  useEffect(() => {
    if (!mapLoaded || !mapTheme) return;
    if (webThemeRef.current == null) webThemeRef.current = initialTheme;
    if (mapTheme === webThemeRef.current) return;
    webThemeRef.current = mapTheme;
    setThemeBusy(true);
    const label = mapTheme === "night" ? "Cambiando a noche…" : "Cambiando a día…";
    setStatus(label);
    inject(`if (typeof window.setMapTheme === 'function') window.setMapTheme('${mapTheme}');`);
  }, [mapLoaded, mapTheme, initialTheme, inject]);

  const syncMarkers = useCallback(
    (nextOrigin: LatLng | null, nextDestination: LatLng | null) => {
      const payload = JSON.stringify({
        origin: nextOrigin,
        destination: nextDestination,
      });
      inject(`
        var data = ${payload};
        if (typeof window.setRouteEndpoints === 'function') {
          window.setRouteEndpoints(data.origin, data.destination);
        }
      `);
    },
    [inject],
  );

  const paintRoute = useCallback(
    (result: HybridRouteResult) => {
      const payload = JSON.stringify({
        origin: result.origin,
        destination: result.destination,
        coordinates: result.coordinates,
        drive: result.drive?.lines ?? null,
        walk: result.walk?.lines ?? null,
        parking: result.parking,
        profile: result.profile ?? null,
      });
      inject(`
        var data = ${payload};
        if (typeof window.setRouteEndpoints === 'function') {
          window.setRouteEndpoints(data.origin, data.destination);
        }
        if (typeof window.setRouteLine === 'function') {
          window.setRouteLine({
            drive: data.drive,
            walk: data.walk,
            parking: data.parking,
            profile: data.profile,
            coordinates: data.coordinates
          });
        }
      `);
    },
    [inject],
  );

  const clearRouteLine = useCallback(() => {
    inject(`if (typeof window.clearRouteLine === 'function') window.clearRouteLine();`);
  }, [inject]);

  const focusPlace = useCallback(
    (point: LatLng) => {
      inject(
        `if (typeof window.focusPlace === 'function') window.focusPlace(${point.longitude}, ${point.latitude});`,
      );
    },
    [inject],
  );

  const runRoute = useCallback(
    async (
      from: LatLng,
      to: LatLng,
      profile: StreetProfile = streetProfileRef.current,
      walkCost?: WalkCost,
    ) => {
      const sameCampusNode =
        pointInCampus(from) &&
        pointInCampus(to) &&
        nearestNodeId(from) != null &&
        nearestNodeId(from) === nearestNodeId(to);
      if (sameCampusNode) {
        setNightChoiceOpen(false);
        setRoute(null);
        setRouteError("Elige dos lugares distintos");
        syncMarkers(from, to);
        clearRouteLine();
        return;
      }

      const askNightChoice =
        walkCost == null &&
        mapTheme === "night" &&
        profile === "foot-walking" &&
        pointInCampus(from) &&
        pointInCampus(to);
      if (askNightChoice) {
        routeRequestRef.current += 1;
        setNightChoiceOpen(true);
        setPreset(null);
        setRoute(null);
        setRouteError(null);
        setRouting(false);
        setStatus("");
        syncMarkers(from, to);
        clearRouteLine();
        return;
      }
      setNightChoiceOpen(false);

      const previous = lastRouteRef.current;
      const sameTrip = previous != null && samePoint(previous.from, from) && samePoint(previous.to, to);
      lastRouteRef.current = { from, to, profile, walkCost };
      if (!sameTrip) setClosureOverride(null);
      setClosureImpact(sameTrip ? effectiveImpactRef.current : baseImpactRef.current);

      const requestId = ++routeRequestRef.current;
      setPreset(null);
      setRouting(true);
      setRouteError(null);
      setRouteIsolated(false);
      setStatus(
        profile === "driving-car"
          ? "Calculando ruta en carro…"
          : profile === "cycling-regular"
            ? "Calculando ruta en bici…"
            : profile === "driving-motorcycle"
              ? "Calculando ruta en moto…"
              : "Calculando ruta a pie…",
      );

      try {
        const result = await routeHybrid(from, to, profile, walkCost ?? "short");
        if (requestId !== routeRequestRef.current) return;
        if (!result) {
          setRoute(null);
          setRouteError("No hay camino entre esos puntos");
          syncMarkers(from, to);
          clearRouteLine();
          return;
        }
        const painted = { ...result, profile };
        setRoute(painted);
        setRouteError(null);
        paintRoute(painted);
        if (result.entrance && result.mode !== "campus") {
          setStatus(`Vía ${result.entrance.street}`);
          setTimeout(() => {
            setStatus((prev) => (prev.startsWith("Vía ") ? "" : prev));
          }, 2800);
        } else {
          setStatus("");
        }
      } catch (error) {
        if (requestId !== routeRequestRef.current) return;
        setRoute(null);
        clearRouteLine();
        syncMarkers(from, to);
        const raw = error instanceof Error ? error.message : "No se pudo calcular la ruta";
        const message = /cancel|abort|timed?\s*out|network request failed|fetch failed/i.test(raw)
          ? "El servicio de calles no respondió. Inténtalo de nuevo."
          : raw;
        setRouteIsolated(error instanceof ClosureIsolationError);
        setRouteError(error instanceof ClosureIsolationError ? null : message);
        setStatus("");
      } finally {
        if (requestId === routeRequestRef.current) setRouting(false);
      }
    },
    [syncMarkers, paintRoute, clearRouteLine, mapTheme],
  );

  const impactAppliedRef = useRef(effectiveImpact);
  useEffect(() => {
    if (impactAppliedRef.current === effectiveImpact) return;
    impactAppliedRef.current = effectiveImpact;
    const last = lastRouteRef.current;
    if (!last || preset || !origin || !destination) return;
    void runRoute(last.from, last.to, last.profile, last.walkCost);
  }, [effectiveImpact, runRoute, preset, origin, destination]);

  if (mapTheme !== appliedTheme) {
    setAppliedTheme(mapTheme);
    const campusWalk =
      Boolean(origin && destination) &&
      !preset &&
      streetProfile === "foot-walking" &&
      pointInCampus(origin!) &&
      pointInCampus(destination!);
    if (campusWalk && mapTheme === "night") {
      setNightChoiceOpen(true);
      setRoute(null);
      setRouteError(null);
      setRouting(false);
      setStatus("");
    } else if (campusWalk && mapTheme === "day" && origin && destination) {
      setNightChoiceOpen(false);
      setDayRecalc({ from: origin, to: destination });
    }
  }

  const handledDayRecalc = useRef<{ from: LatLng; to: LatLng } | null>(null);
  useEffect(() => {
    if (!dayRecalc || handledDayRecalc.current === dayRecalc) return;
    handledDayRecalc.current = dayRecalc;
    void runRoute(dayRecalc.from, dayRecalc.to, "foot-walking", "short");
  }, [dayRecalc, runRoute]);

  useEffect(() => {
    if (!nightChoiceOpen || !origin || !destination) return;
    routeRequestRef.current += 1;
    clearRouteLine();
    syncMarkers(origin, destination);
  }, [nightChoiceOpen, origin, destination, clearRouteLine, syncMarkers]);

  const changeStreetProfile = useCallback(
    (next: StreetProfile) => {
      streetProfileRef.current = next;
      setStreetProfile(next);
      if (preset || !origin || !destination) return;
      void runRoute(origin, destination, next);
    },
    [preset, origin, destination, runRoute],
  );

  const runPreset = useCallback(
    (presetRoute: PresetRoute, fromPoint?: LatLng, fromName?: string) => {
      setNightChoiceOpen(false);
      const start = fromPoint ?? origin;
      const startName = fromPoint ? (fromName ?? "Origen") : originName;
      if (!start) {
        setPreset(null);
        setPendingPreset(presetRoute);
        activeSlotRef.current = "origin";
        setActiveSlot("origin");
        return;
      }

      const resolved = presetRoute.stops.flatMap((code) => {
        const place = findDestinationByPlaceId(destinations, code);
        if (!place?.reachable) return [];
        return [{ name: place.title, point: pointForDestination(place) }];
      });
      const missing = presetRoute.stops.find(
        (code) => !findDestinationByPlaceId(destinations, code)?.reachable,
      );
      if (missing || resolved.length < 2) {
        const label = missing ? (catalog?.places[missing]?.name ?? missing) : null;
        const disconnected = missing
          ? findDestinationByPlaceId(destinations, missing)
          : null;
        setPreset(null);
        setRoute(null);
        setRouteError(
          disconnected && !disconnected.reachable
            ? "Este espacio todavía no está conectado a los caminos"
            : label
              ? `${label} no está en el mapa`
              : "La ruta necesita al menos dos sitios",
        );
        clearRouteLine();
        return;
      }

      const ordered = orderStopsFromOrigin(start, resolved);
      if (!ordered) {
        setRoute(null);
        setRouteError("No hay camino entre esos sitios");
        clearRouteLine();
        return;
      }

      const result = routeThroughPoints(
        ordered.map((stop) => stop.point),
        start,
      );
      const labeled = [
        { letter: pointLetter(0), name: startName ?? "Origen", point: start },
        ...ordered.map((stop, index) => ({
          letter: pointLetter(index + 1),
          name: stop.name,
          point: stop.point,
        })),
      ];
      const last = labeled[labeled.length - 1];
      setSelected(null);
      setQuery("");
      setPendingPreset(null);
      setPickingSlot(null);
      setOrigin(start);
      setOriginName(startName ?? "Origen");
      setDestination(last.point);
      setDestinationName(last.name);
      setNightChoiceOpen(false);
      setPreset({ name: presetRoute.name, stops: labeled.map(({ letter, name }) => ({ letter, name })) });
      activeSlotRef.current = "destination";
      setActiveSlot("destination");

      if (!result) {
        setRoute(null);
        setRouteError("No hay camino entre esos sitios");
        clearRouteLine();
        return;
      }

      setRoute(result);
      setRouteError(null);
      setStatus("");
      const payload = JSON.stringify({
        coordinates: result.coordinates,
        stops: labeled.map((stop) => ({
          letter: stop.letter,
          longitude: stop.point.longitude,
          latitude: stop.point.latitude,
        })),
      });
      inject(`
        var data = ${payload};
        if (typeof window.setRouteStops === 'function') window.setRouteStops(data.stops);
        if (typeof window.setRouteLine === 'function') window.setRouteLine(data.coordinates);
      `);
    },
    [origin, originName, destinations, catalog, clearRouteLine, inject],
  );

  const clearRouteUi = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setOriginName(null);
    setDestinationName(null);
    setPreset(null);
    setRoute(null);
    setRouteError(null);
    setAssistantError(null);
    activeSlotRef.current = "origin";
    setActiveSlot("origin");
    setQuery("");
    setAssistantPrompt("");
    setAssistantError(null);
    setSelected(null);
    setPendingPreset(null);
    setPickingSlot(null);
    setNightChoiceOpen(false);
    lastRouteRef.current = null;
    setClosureOverride(null);
    setRouteIsolated(false);
    inject(`if (typeof window.clearRoute === 'function') window.clearRoute();`);
  }, [inject]);

  const reportUnreachableSpace = useCallback(() => {
    const message = "Este espacio todavía no está conectado a los caminos";
    setRouteError(message);
    setStatus(message);
    setTimeout(() => {
      setStatus((prev) => (prev === message ? "" : prev));
    }, 2800);
  }, []);

  const assignPoint = useCallback(
    (
      slot: RouteSlot,
      point: LatLng,
      target: CampusDestination | null,
      label?: string | null,
    ) => {
      if (target?.kind === "space" && !target.reachable) {
        reportUnreachableSpace();
        return;
      }
      if (slot === "origin") originPlaceRef.current = target;
      else destinationPlaceRef.current = target;
      const toward = slot === "destination" ? origin : destination;
      const snapped = target ? pointForDestination(target, toward) : pointForBuilding(null, point, toward);
      setSelected(null);
      setPickingSlot(null);
      const name = label ?? target?.title ?? placeInfo(null, catalog).title;
      const pending = pendingPresetRef.current;
      if (slot === "origin" && pending) {
        runPreset(pending, snapped, name);
        return;
      }
      const resolved = doorsForEnds(
        slot === "origin" ? snapped : origin,
        slot === "destination" ? snapped : destination,
        originPlaceRef.current,
        destinationPlaceRef.current,
      );
      const nextOrigin = resolved.origin;
      const nextDestination = resolved.destination;
      const nextOriginName = slot === "origin" ? name : originName;
      const nextDestinationName = slot === "destination" ? name : destinationName;

      setOrigin(nextOrigin);
      setDestination(nextDestination);
      setOriginName(nextOriginName);
      setDestinationName(nextDestinationName);
      setQuery("");

      if (nextOrigin && nextDestination) {
        void runRoute(nextOrigin, nextDestination);
        return;
      }

      setNightChoiceOpen(false);
      setRoute(null);
      setRouteError(null);
      const nextSlot: RouteSlot = nextOrigin ? "destination" : "origin";
      activeSlotRef.current = nextSlot;
      setActiveSlot(nextSlot);
      syncMarkers(nextOrigin, nextDestination);
      clearRouteLine();
    },
    [origin, destination, originName, destinationName, runRoute, runPreset, syncMarkers, clearRouteLine, catalog, reportUnreachableSpace],
  );

  const clearSlot = useCallback(
    (slot: RouteSlot) => {
      if (slot === "origin") originPlaceRef.current = null;
      else destinationPlaceRef.current = null;
      const nextOrigin = slot === "origin" ? null : origin;
      const nextDestination = slot === "destination" ? null : destination;
      if (slot === "origin") setOriginName(null);
      else setDestinationName(null);
      setOrigin(nextOrigin);
      setDestination(nextDestination);
      setRoute(null);
      setRouteError(null);
      setNightChoiceOpen(false);
      setPickingSlot(slot);
      activeSlotRef.current = slot;
      setActiveSlot(slot);
      syncMarkers(nextOrigin, nextDestination);
      clearRouteLine();
    },
    [origin, destination, syncMarkers, clearRouteLine],
  );

  const swapEndpoints = useCallback(() => {
    if (!origin && !destination) return;
    const swappedOriginPlace = destinationPlaceRef.current;
    const swappedDestinationPlace = originPlaceRef.current;
    originPlaceRef.current = swappedOriginPlace;
    destinationPlaceRef.current = swappedDestinationPlace;
    const resolved = doorsForEnds(
      destination,
      origin,
      originPlaceRef.current,
      destinationPlaceRef.current,
    );
    const nextOrigin = resolved.origin;
    const nextDestination = resolved.destination;
    setOrigin(nextOrigin);
    setDestination(nextDestination);
    setOriginName(destinationName);
    setDestinationName(originName);
    if (nextOrigin && nextDestination) {
      void runRoute(nextOrigin, nextDestination);
      return;
    }
    setNightChoiceOpen(false);
    setRoute(null);
    setRouteError(null);
    const nextSlot: RouteSlot = nextOrigin ? "destination" : "origin";
    activeSlotRef.current = nextSlot;
    setActiveSlot(nextSlot);
    syncMarkers(nextOrigin, nextDestination);
    clearRouteLine();
  }, [origin, destination, originName, destinationName, runRoute, syncMarkers, clearRouteLine]);

  const showPlace = useCallback(
    (target: CampusDestination) => {
      const snapped = pointForDestination(target, origin ?? destination);
      setSelected({ snapped, destination: target });
      focusPlace(snapped);
    },
    [focusPlace, origin, destination],
  );

  const useSelected = useCallback(
    (slot: RouteSlot) => {
      const current = selectedRef.current;
      if (!current) return;
      assignPoint(slot, current.snapped, current.destination);
    },
    [assignPoint],
  );

  const openSelectedDetails = useCallback(() => {
    const info = selectedRef.current?.destination;
    if (!info?.placeId) return;
    openPlaceDetails({
      code: info.placeId,
      title: info.title,
      subtitle: info.subtitle,
      categories: info.categories,
      description: catalog?.places[info.placeId]?.description ?? null,
      tone: categoriesForCode(info.placeId, catalog)[0]?.tone ?? null,
    });
  }, [catalog, openPlaceDetails]);

  const chooseSearchResult = useCallback(
    (place: CampusDestination) => {
      Keyboard.dismiss();
      const slot = searchSlotRef.current ?? "destination";
      if (place.kind === "space" && !place.reachable) {
        showPlace(place);
        setQuery("");
        reportUnreachableSpace();
        return;
      }
      const toward = slot === "destination" ? origin : destination;
      assignPoint(slot, place.point, place);
      focusPlace(pointForDestination(place, toward));
    },
    [assignPoint, focusPlace, origin, destination, showPlace, reportUnreachableSpace],
  );

  const pickSlot = useCallback((slot: RouteSlot) => {
    setQuery("");
    setPickingSlot((current) => (current === slot ? null : slot));
    activeSlotRef.current = slot;
    setActiveSlot(slot);
  }, []);

  const toggleView = useCallback(() => {
    const next = !view3d;
    setView3d(next);
    inject(
      `if (typeof window.setCampusView === 'function') window.setCampusView('${next ? "3d" : "2d"}');`,
    );
  }, [view3d, inject]);

  const locateMe = useCallback(async () => {
    if (locating || routing) return;
    setLocating(true);
    setStatus("Buscando tu ubicación…");
    setMockLocationActive(false);
    setAssistantError(null);
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== "granted") {
        setStatus("Permiso de ubicación denegado");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const raw: LatLng = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      inject(`
        if (typeof window.setUserLocation === 'function') {
          window.setUserLocation(${raw.longitude}, ${raw.latitude}, true);
        }
      `);

      const outside = !pointInCampus(raw);
      const point = snapCampusPoint(raw);
      setUserLocation(point);
      setUserOutsideCampus(outside);
      setSelected(null);
      setPickingSlot(null);
      setTab("map");
      setQuery("");

      const pending = pendingPresetRef.current;
      if (pending && !outside) {
        runPreset(pending, point, "Mi ubicación");
        setStatus("");
        return;
      }

      setOrigin(point);
      setOriginName("Mi ubicación");
      setRoute(null);
      setRouteError(null);
      activeSlotRef.current = "destination";
      setActiveSlot("destination");

      if (destination && !outside) {
        void runRoute(point, destination);
        return;
      }

      clearRouteLine();
      syncMarkers(point, destination);

      if (outside) {
        setStatus("Ubicación lista · elige un destino");
      } else {
        setStatus("Ubicación en el campus · elige destino");
      }
    } catch {
      setStatus("No se pudo obtener tu ubicación");
    } finally {
      setLocating(false);
      setTimeout(() => {
        setStatus((prev) => {
          if (
            prev.startsWith("Ubicación") ||
            prev === "Permiso de ubicación denegado" ||
            prev === "No se pudo obtener tu ubicación" ||
            prev === "Buscando tu ubicación…"
          ) {
            return "";
          }
          return prev;
        });
      }, 3200);
    }
  }, [locating, routing, inject, destination, syncMarkers, clearRouteLine, runPreset, runRoute]);

  const toggleMockLocation = useCallback(() => {
    if (routing || assistantLoading) return;
    setAssistantError(null);

    if (mockLocationActive) {
      setMockLocationActive(false);
      setUserLocation(null);
      setUserOutsideCampus(false);
      inject(`
        if (typeof window.setUserLocation === 'function') {
          window.setUserLocation(null);
        }
      `);
      if (originName === "Ubicación de prueba") {
        setOrigin(null);
        setOriginName(null);
        setRoute(null);
        setRouteError(null);
        clearRouteLine();
        syncMarkers(null, destination);
        activeSlotRef.current = "origin";
        setActiveSlot("origin");
      }
      setStatus("Ubicación de prueba desactivada");
      setTimeout(() => {
        setStatus((prev) => (prev === "Ubicación de prueba desactivada" ? "" : prev));
      }, 2200);
      return;
    }

    const raw: LatLng = {
      latitude: MOCK_CAMPUS_LOCATION.latitude,
      longitude: MOCK_CAMPUS_LOCATION.longitude,
    };
    const point = snapCampusPoint(raw);
    setMockLocationActive(true);
    setUserLocation(point);
    setUserOutsideCampus(false);
    setSelected(null);
    setOrigin(point);
    setOriginName("Ubicación de prueba");
    setQuery("");
    setRoute(null);
    setRouteError(null);
    clearRouteLine();
    syncMarkers(point, destination);
    activeSlotRef.current = "destination";
    setActiveSlot("destination");
    inject(`
      if (typeof window.setUserLocation === 'function') {
        window.setUserLocation(${point.longitude}, ${point.latitude}, true);
      }
    `);
    setStatus("Ubicación de prueba en campus · elige destino");
    setTimeout(() => {
      setStatus((prev) =>
        prev.startsWith("Ubicación de prueba") ? "" : prev,
      );
    }, 2800);
  }, [
    routing,
    assistantLoading,
    mockLocationActive,
    originName,
    destination,
    inject,
    syncMarkers,
    clearRouteLine,
  ]);

  /** Mantener presionado el mapa mueve la ubicación simulada a ese punto. */
  const placeTestLocation = useCallback(
    (raw: LatLng) => {
      if (POSITION_MODE !== "simulated") {
        setStatus("La ubicación de prueba no está disponible en modo GPS");
        setTimeout(() => {
          setStatus((prev) => (prev.startsWith("La ubicación de prueba") ? "" : prev));
        }, 2600);
        return;
      }
      const point = snapCampusPoint(raw);
      setMockLocationActive(true);
      setUserLocation(point);
      setUserOutsideCampus(false);
      inject(`
        if (typeof window.setUserLocation === 'function') {
          window.setUserLocation(${point.longitude}, ${point.latitude}, false);
        }
      `);
      setStatus("Ubicación de prueba fijada aquí");
      setTimeout(() => {
        setStatus((prev) => (prev === "Ubicación de prueba fijada aquí" ? "" : prev));
      }, 2600);
    },
    [inject],
  );

  const closeAssistant = useCallback(() => {
    if (assistantLoading) return;
    setAssistantError(null);
    setTab("map");
  }, [assistantLoading]);

  const submitAssistant = useCallback(async () => {
    if (assistantLoading || routing) return;
    const text = assistantPrompt.trim();
    if (!text) {
      setAssistantError("Escribe a dónde quieres ir, ej: desde E19 al P9");
      return;
    }

    const requestId = ++assistantRequestRef.current;
    setAssistantLoading(true);
    setAssistantError(null);
    setRouteError(null);
    setStatus("Interpretando pedido…");
    Keyboard.dismiss();

    try {
      const intent = await parseRouteIntent(text, placeCatalog);
      if (requestId !== assistantRequestRef.current) return;

      if (intent.clarification && !intent.destinationPlaceId && !intent.destinationSpaceKind) {
        setAssistantError(intent.clarification);
        setStatus("");
        return;
      }

      const namedDestination = findDestination(destinations, intent.destinationPlaceId);
      if (!namedDestination && !intent.destinationSpaceKind) {
        setAssistantError(
          intent.clarification ??
            "No reconocí el destino. Prueba con un código, un nombre o un espacio (ej: B13 o P9).",
        );
        setStatus("");
        return;
      }

      const originPlace = findDestination(destinations, intent.originPlaceId);
      if (originPlace?.kind === "space" && !originPlace.reachable) {
        setAssistantError("Este espacio todavía no está conectado a los caminos");
        setStatus("");
        return;
      }

      let nextOrigin: LatLng | null = originPlace ? pointForDestination(originPlace) : null;
      let nextOriginName: string | null = originPlace?.title ?? null;

      if (!nextOrigin) {
        const currentUser = userLocationRef.current;
        const outside = userOutsideCampusRef.current;
        const mockOn = mockLocationActiveRef.current;
        if (currentUser && (!outside || mockOn) && pointInCampus(currentUser)) {
          nextOrigin = currentUser;
          nextOriginName = mockOn ? "Ubicación de prueba" : "Mi ubicación";
        }
      }

      if (!nextOrigin) {
        setAssistantError(
          "Indica el origen (ej: desde E19 al P9) o activa «Ubicación de prueba» abajo.",
        );
        setStatus("");
        return;
      }

      let destinationPlace = namedDestination;
      if (!destinationPlace && intent.destinationSpaceKind) {
        const nearest = nearestSpace(nextOrigin, intent.destinationSpaceKind, catalog);
        destinationPlace = nearest ? findDestination(destinations, nearest.id) : null;
        if (!destinationPlace) {
          setAssistantError(
            `No hay un ${spaceKindLabel(intent.destinationSpaceKind).toLowerCase()} conectado a los caminos desde aquí`,
          );
          setStatus("");
          return;
        }
      }

      if (!destinationPlace) {
        setAssistantError(
          intent.clarification ??
            "No reconocí el destino. Prueba con un código, un nombre o un espacio (ej: B13 o P9).",
        );
        setStatus("");
        return;
      }

      if (destinationPlace.kind === "space" && !destinationPlace.reachable) {
        setAssistantError("Este espacio todavía no está conectado a los caminos");
        setStatus("");
        return;
      }

      if (!pointInCampus(nextOrigin) || !pointInCampus(destinationPlace.point)) {
        setAssistantError(
          "Por ahora el asistente solo arma rutas dentro del campus.",
        );
        setStatus("");
        return;
      }

      if (intent.profile) {
        setStreetProfile(intent.profile);
        streetProfileRef.current = intent.profile;
      }

      const to = pointForDestination(destinationPlace, nextOrigin);
      const from = originPlace
        ? pointForDestination(originPlace, to)
        : snapCampusPoint(nextOrigin);
      const fromName = nextOriginName ?? "Origen";
      const toName = destinationPlace.title;

      setSelected(null);
      setOrigin(from);
      setDestination(to);
      setOriginName(fromName);
      setDestinationName(toName);
      setQuery("");
      setAssistantPrompt("");
      setPendingPreset(null);
      setPickingSlot(null);
      setTab("map");
      activeSlotRef.current = "destination";
      setActiveSlot("destination");
      setStatus("");
      await runRoute(from, to, streetProfileRef.current);
    } catch (error) {
      if (requestId !== assistantRequestRef.current) return;
      const message =
        error instanceof RouteIntentError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo interpretar el pedido";
      setAssistantError(message);
      setStatus("");
    } finally {
      if (requestId === assistantRequestRef.current) {
        setAssistantLoading(false);
      }
    }
  }, [assistantLoading, routing, assistantPrompt, placeCatalog, destinations, runRoute, catalog]);

  useEffect(() => {
    if (!mapLoaded) return;
    const payload = JSON.stringify(closuresGeoJson(closures));
    inject(`if (typeof window.setClosures === 'function') window.setClosures(${payload});`);
  }, [mapLoaded, closures, inject]);

  useEffect(() => {
    if (!mapLoaded) return;
    const payload = JSON.stringify(draftGeoJson(reportMode ? draftKeys : []));
    inject(`if (typeof window.setClosureDraft === 'function') window.setClosureDraft(${payload});`);
  }, [mapLoaded, reportMode, draftKeys, inject]);

  const startReport = useCallback(() => {
    setThemeMenuOpen(false);
    if (!userId) {
      setStatus("Inicia sesión para reportar una vía cerrada");
      setTimeout(() => {
        setStatus((prev) => (prev.startsWith("Inicia sesión para reportar") ? "" : prev));
      }, 2800);
      setProfileOpen(true);
      return;
    }
    Keyboard.dismiss();
    setTab("map");
    setSelected(null);
    setDraftKeys([]);
    setReportHint(null);
    setReportMode(true);
  }, [userId, setProfileOpen, setTab]);

  const cancelReport = useCallback(() => {
    setReportMode(false);
    setReportPanelHeight(0);
    setDraftKeys([]);
    setReportHint(null);
  }, []);

  const undoDraftSegment = useCallback(() => {
    setDraftKeys((current) => current.slice(0, -1));
    setReportHint(null);
  }, []);

  const clearDraftSegments = useCallback(() => {
    setDraftKeys([]);
    setReportHint(null);
  }, []);

  const toggleDraftSegment = useCallback(
    (point: LatLng) => {
      const segment = segmentAtPoint(point, 25);
      if (!segment) {
        setReportHint("Toca más cerca de un sendero, pasillo o vía.");
        return;
      }
      const existing = closures.find((closure) => closure.segmentKeys.includes(segment.key));
      if (existing) {
        setReportHint("Ese tramo ya tiene un reporte. Valídalo en lugar de crear otro.");
        setDetailId(existing.id);
        return;
      }
      if (draftKeys.includes(segment.key)) {
        setDraftKeys(draftKeys.filter((key) => key !== segment.key));
        setReportHint(null);
        return;
      }
      if (draftKeys.length >= CLOSURE_MAX_SEGMENTS) {
        setReportHint(`Un reporte admite hasta ${CLOSURE_MAX_SEGMENTS} tramos.`);
        return;
      }
      setDraftKeys([...draftKeys, segment.key]);
      setReportHint(segment.name ? `${segment.name}. Toca otra vez para quitarlo.` : null);
    },
    [closures, draftKeys],
  );

  const openComposer = useCallback(() => {
    if (draftKeys.length === 0) return;
    reportedRef.current = false;
    setComposerKey((key) => key + 1);
    setComposerOpen(true);
  }, [draftKeys.length]);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    if (reportedRef.current) cancelReport();
  }, [cancelReport]);

  const draftOnSite = isOnSite(position, draftKeys);
  const draftDistanceM =
    position && draftKeys.length > 0 ? distanceToSegmentsM(position.point, draftKeys) : null;
  const draftLabel = useMemo(() => {
    const names = [...new Set(draftKeys.map((key) => campusSegment(key)?.name).filter(Boolean))];
    if (names.length === 0) return null;
    const count = draftKeys.length === 1 ? "1 tramo" : `${draftKeys.length} tramos`;
    return `${names.slice(0, 2).join(", ")} · ${count}`;
  }, [draftKeys]);

  const draftPlaceLabel = useMemo(() => {
    const names = [...new Set(draftKeys.map((key) => campusSegment(key)?.name).filter(Boolean))];
    return names.length > 0 ? names.slice(0, 2).join(", ") : null;
  }, [draftKeys]);

  const submitReport = useCallback(
    async (draft: { category: ActiveClosure["category"]; description: string; estimatedHours: number | null }) => {
      await reportClosureNow({
        segmentKeys: draftKeys,
        category: draft.category,
        description: draft.description,
        estimatedHours: draft.estimatedHours,
        onSite: isOnSite(position, draftKeys),
        positionSource: serverPositionSource(position),
      });
      reportedRef.current = true;
    },
    [draftKeys, position, reportClosureNow],
  );

  const detailClosure = detailId != null ? (closures.find((item) => item.id === detailId) ?? null) : null;

  const castVote = useCallback(
    async (closure: ActiveClosure, choice: "still_closed" | "now_open") => {
      await voteClosureNow(
        closure.id,
        choice,
        isOnSite(position, closure.segmentKeys),
        serverPositionSource(position),
      );
      await markClosurePrompted(closure.id, userId);
      setPromptedIds((current) => new Set(current).add(closure.id));
    },
    [position, userId, voteClosureNow],
  );

  const promptClosure = useMemo(() => {
    if (!userId || reportMode || composerOpen || detailId != null || !positionIsTrusted(position)) return null;
    let best: { closure: ActiveClosure; distanceM: number } | null = null;
    for (const closure of closures) {
      if (closure.mine || closure.source === "admin" || myVotes.has(closure.id) || promptedIds.has(closure.id)) {
        continue;
      }
      const distanceM = distanceToSegmentsM(position.point, closure.segmentKeys);
      if (distanceM <= ON_SITE_RADIUS_M && (!best || distanceM < best.distanceM)) {
        best = { closure, distanceM };
      }
    }
    return best;
  }, [userId, reportMode, composerOpen, detailId, position, closures, myVotes, promptedIds]);

  const dismissPrompt = useCallback(
    async (closureId: number) => {
      setPromptedIds((current) => new Set(current).add(closureId));
      await markClosurePrompted(closureId, userId);
    },
    [userId],
  );

  const closureNotice = useMemo<RouteClosureNotice | null>(() => {
    if (routeIsolated) {
      return {
        tone: "danger",
        text: "El destino quedó aislado por una vía cerrada. No hay otro camino abierto.",
        actionLabel: "Mostrar ruta igualmente",
        onAction: () => setClosureOverride({ kind: "relaxed" }),
      };
    }
    if (!route || route.coordinates.length < 2) return null;
    if (closureOverride?.kind === "relaxed") {
      const crossing = segmentsOnRoute(route.coordinates, baseImpact.blocked);
      return crossing.length
        ? { tone: "danger", text: "Esta ruta cruza una vía cerrada. Puede que no puedas pasar." }
        : null;
    }
    const crossingReported = segmentsOnRoute(route.coordinates, effectiveImpact.penalized);
    if (crossingReported.length) {
      return {
        tone: "warning",
        text: "La ruta pasa por un tramo reportado como cerrado, aún sin confirmar.",
        actionLabel: "Evitar de todos modos",
        onAction: () =>
          setClosureOverride((current) => ({
            kind: "avoid",
            keys: [...(current?.kind === "avoid" ? current.keys : []), ...crossingReported],
          })),
      };
    }
    const nearby = segmentsOnRoute(
      route.coordinates,
      [...effectiveImpact.blocked, ...effectiveImpact.penalized],
      AVOIDED_NEAR_M,
    );
    if (nearby.length === 0) return null;
    const ids = new Set(
      closures.filter((closure) => closure.segmentKeys.some((key) => nearby.includes(key))).map((c) => c.id),
    );
    const count = Math.max(1, ids.size);
    return {
      tone: "info",
      text:
        count === 1
          ? "La ruta evita una vía cerrada cercana."
          : `La ruta evita ${count} vías cerradas cercanas.`,
    };
  }, [routeIsolated, route, closureOverride, baseImpact, effectiveImpact, closures]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type: string;
          message?: string;
          mode?: string;
          longitude?: number;
          latitude?: number;
          building?: BuildingProperties | null;
          spaceId?: string | null;
          bathroomEdificio?: string | null;
          closureId?: number | null;
        };
        if (data.type === "map-ready") {
          setStatus("Preparando campus…");
          setMapLoaded(true);
          injectLayers();
        } else if (data.type === "theme-ready") {
          setThemeBusy(false);
          setStatus((prev) => (prev.startsWith("Cambiando a ") ? "" : prev));
        } else if (data.type === "ready") {
          setStatus("");
          inject(
            `if (typeof window.setChromeBottom === 'function') window.setChromeBottom(${Math.round(chromeBottomRef.current)});`,
          );
        } else if (data.type === "view-mode") {
          setView3d(data.mode !== "2d");
        } else if (data.type === "map-long-press") {
          if (typeof data.longitude === "number" && typeof data.latitude === "number") {
            placeTestLocation({ longitude: data.longitude, latitude: data.latitude });
          }
        } else if (data.type === "map-click") {
          Keyboard.dismiss();
          setQuery("");
          setThemeMenuOpen(false);
          if (typeof data.longitude === "number" && typeof data.latitude === "number") {
            const point = { longitude: data.longitude, latitude: data.latitude };
            if (reportMode) {
              toggleDraftSegment(point);
              return;
            }
            const slot = inTripRef.current && tabRef.current === "map" ? searchSlotRef.current : null;
            if (!slot && typeof data.closureId === "number") {
              setDetailId(data.closureId);
              return;
            }
            const bathroomCode =
              typeof data.bathroomEdificio === "string" && data.bathroomEdificio
                ? data.bathroomEdificio
                : null;
            const target = bathroomCode
              ? (destinations.find((item) => item.kind === "building" && item.placeId === bathroomCode) ??
                (data.spaceId
                  ? (destinations.find((item) => item.spaceId === data.spaceId) ?? null)
                  : null))
              : data.building
                ? destinationFromBuilding(data.building, destinations, point, catalog)
                : data.spaceId
                  ? (destinations.find((item) => item.spaceId === data.spaceId) ?? null)
                  : null;
            if (slot) {
              assignPoint(slot, point, target);
            } else if (target) {
              showPlace(target);
              setTab("map");
            } else {
              setSelected(null);
            }
          }
        } else if (data.type === "error") {
          setStatus(data.message || "Error al cargar capas");
        }
      } catch {
        // ignore
      }
    },
    [
      injectLayers,
      assignPoint,
      showPlace,
      inject,
      destinations,
      catalog,
      reportMode,
      toggleDraftSegment,
      placeTestLocation,
    ],
  );

  const startTour = useCallback(
    (tour: PresetRoute) => {
      setTab("map");
      setSelected(null);
      setPickingSlot(null);
      if (origin) {
        runPreset(tour);
        return;
      }
      setRoute(null);
      setRouteError(null);
      setDestination(null);
      setDestinationName(null);
      syncMarkers(null, null);
      clearRouteLine();
      setPendingPreset(tour);
      activeSlotRef.current = "origin";
      setActiveSlot("origin");
    },
    [origin, runPreset, syncMarkers, clearRouteLine],
  );

  const stopName = useCallback(
    (code: string) =>
      catalog?.places[code]?.name ?? findDestinationByPlaceId(destinations, code)?.title ?? code,
    [catalog, destinations],
  );

  const inTrip = Boolean(origin || destination || preset || pendingPreset);

  const changeTab = useCallback((next: MapPanel) => {
    // Mientras se eligen tramos, la barra inferior no debe tapar el modo reporte.
    if (reportMode) return;
    setQuery("");
    Keyboard.dismiss();

    if (next === tab) {
      if (tab === "assistant") {
        closeAssistant();
        return;
      }
      if (tab === "tours" || tab === "reports") {
        setTab("map");
        return;
      }
      if (selected) {
        setSelected(null);
        return;
      }
      if (inTrip) {
        clearRouteUi();
      }
      return;
    }

    setTab(next);
  }, [reportMode, tab, selected, inTrip, closeAssistant, clearRouteUi, setTab]);

  useEffect(() => registerSelectMapTab(changeTab), [registerSelectMapTab, changeTab]);

  const searchSlot: RouteSlot | null = !inTrip
    ? "destination"
    : preset
      ? null
      : pickingSlot ??
        (!origin ? "origin" : !destination && !pendingPreset ? "destination" : null);
  inTripRef.current = inTrip;
  searchSlotRef.current = searchSlot;

  const showSearch = tab === "map" && !selected && searchSlot != null && !reportMode;
  const searchPlaceholder =
    searchSlot === "origin"
      ? "¿Desde dónde sales?"
      : inTrip && destinationName
        ? "Cambiar destino"
        : "¿A dónde vas?";

  const placePreview = selected
    ? {
        title: selected.destination.title,
        subtitle: selected.destination.subtitle,
        code: selected.destination.placeId,
        categories: selected.destination.categories,
        detail: bathroomSummary(selected.destination.placeId) ?? selected.destination.detail,
      }
    : null;
  const lastPlacePreview = useRef(placePreview);
  if (placePreview) lastPlacePreview.current = placePreview;

  const exploreActive = tab === "map" && Boolean(placePreview);
  const toursActive = tab === "tours";
  const reportsActive = tab === "reports";
  const assistantActive = tab === "assistant";
  const routeActive = tab === "map" && !placePreview && inTrip;
  const anySheetActive = exploreActive || toursActive || reportsActive || assistantActive || routeActive;
  const exploreSheet = useSheetPresence(exploreActive);
  const toursSheet = useSheetPresence(toursActive);
  const reportsSheet = useSheetPresence(reportsActive);
  const assistantSheet = useSheetPresence(assistantActive);
  const routeSheet = useSheetPresence(routeActive);
  const shownPlace = placePreview ?? (exploreSheet.mounted ? lastPlacePreview.current : null);

  const tabBarHeight = homeTabBarHeight(insets.bottom);
  const headerBlock = insets.top + (showSearch ? 72 : 16);
  const sheetMaxHeight = Math.max(260, windowHeight - headerBlock - tabBarHeight - 72);
  const chromeBottom = reportMode ? reportPanelHeight : panelHeight;
  chromeBottomRef.current = chromeBottom;

  useEffect(() => {
    inject(
      `if (typeof window.setChromeBottom === 'function') window.setChromeBottom(${Math.round(chromeBottom)});`,
    );
  }, [chromeBottom, inject]);

  return (
    <View className="flex-1 bg-[#dbe4ee] dark:bg-[#070b12]">
      {html ? (
        <UniWebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          className="z-0 flex-1 bg-[#dbe4ee] dark:bg-[#070b12]"
          onMessage={onMessage}
          onError={() => setStatus("No se pudo cargar el mapa (revisa internet)")}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          mixedContentMode="always"
          allowsInlineMediaPlayback
          nestedScrollEnabled
          androidLayerType="hardware"
        />
      ) : (
        <View className="flex-1" />
      )}

      {reportMode ? null : (
        <MapHeader
          topInset={insets.top}
          status={status}
          showSearch={showSearch}
          query={query}
          onQueryChange={setQuery}
          results={results}
          onSelectResult={chooseSearchResult}
          placeholder={searchPlaceholder}
        />
      )}

      {reportMode && status ? (
        <View
          className="absolute left-0 right-0 z-40 items-center"
          style={{ top: insets.top + 66 }}
          pointerEvents="none"
        >
          <View className="flex-row items-center rounded-full bg-white/95 px-3 py-2 shadow-[0_6px_16px_rgba(17,17,17,0.1)] dark:bg-[#161d27]/95">
            <Text className="text-[13px] font-semibold text-[#111111] dark:text-[#f2f4f7]">{status}</Text>
          </View>
        </View>
      ) : null}

      {reportMode ? null : (
        <MapControls
          top={insets.top + 8}
          view3d={view3d}
          onToggleView={toggleView}
          locating={locating}
          onLocate={locateMe}
          themeMode={themeMode}
          theme={mapTheme}
          themeBusy={themeBusy}
          themeMenuOpen={themeMenuOpen}
          onThemeMenuOpenChange={setThemeMenuOpen}
          onThemeModeChange={setThemeMode}
        />
      )}

      {reportMode ? (
        <ClosureReportBar
          top={insets.top + 8}
          bottom={12}
          selectedCount={draftKeys.length}
          maxSegments={CLOSURE_MAX_SEGMENTS}
          hint={reportHint}
          placeLabel={draftPlaceLabel}
          onCancel={cancelReport}
          onContinue={openComposer}
          onUndo={undoDraftSegment}
          onClear={clearDraftSegments}
          onHeight={setReportPanelHeight}
        />
      ) : null}

      {promptClosure ? (
        <ClosurePromptCard
          key={promptClosure.closure.id}
          bottom={chromeBottom + 12}
          closure={promptClosure.closure}
          distanceM={promptClosure.distanceM}
          simulated={position?.isSimulated ?? true}
          onVote={(choice) => castVote(promptClosure.closure, choice)}
          onDismiss={() => {
            void dismissPrompt(promptClosure.closure.id);
          }}
          onOpen={() => setDetailId(promptClosure.closure.id)}
        />
      ) : null}

      <ClosureComposer
        key={composerKey}
        visible={composerOpen}
        segmentCount={draftKeys.length}
        placeLabel={draftLabel}
        onSite={draftOnSite}
        distanceM={draftDistanceM}
        simulated={position?.isSimulated ?? true}
        onSubmit={submitReport}
        onClose={closeComposer}
        onSeeMine={() => {
          closeComposer();
          setTab("reports");
        }}
      />

      <ClosureDetail
        key={detailClosure?.id ?? "none"}
        closure={detailClosure}
        myVote={detailClosure ? (myVotes.get(detailClosure.id) ?? null) : null}
        signedIn={userId != null}
        onSite={detailClosure ? isOnSite(position, detailClosure.segmentKeys) : false}
        distanceM={
          detailClosure && position ? distanceToSegmentsM(position.point, detailClosure.segmentKeys) : null
        }
        simulated={position?.isSimulated ?? true}
        onVote={async (choice) => {
          if (detailClosure) await castVote(detailClosure, choice);
        }}
        onSignIn={() => {
          setDetailId(null);
          setProfileOpen(true);
        }}
        onClose={() => setDetailId(null)}
      />

      {exploreSheet.mounted && shownPlace ? (
        <ExploreSheet
          bottomOffset={0}
          maxHeight={Math.min(sheetMaxHeight, windowHeight * 0.5)}
          place={shownPlace}
          onClosePlace={() => setSelected(null)}
          onUsePlace={useSelected}
          onOpenDetails={
            shownPlace.code && catalog?.places[shownPlace.code] ? openSelectedDetails : undefined
          }
          onHeight={
            exploreActive || (!anySheetActive && exploreSheet.mounted) ? setPanelHeight : undefined
          }
          visible={exploreSheet.visible}
          onExited={exploreSheet.onExited}
        />
      ) : null}

      {toursSheet.mounted ? (
        <ToursSheet
          bottomOffset={0}
          maxHeight={Math.min(sheetMaxHeight, windowHeight * 0.72)}
          onHeight={
            toursActive || (!anySheetActive && toursSheet.mounted) ? setPanelHeight : undefined
          }
          visible={toursSheet.visible}
          onExited={toursSheet.onExited}
          routes={catalog?.routes ?? []}
          loading={!catalog}
          activeName={preset?.name ?? pendingPreset?.name ?? null}
          stopName={stopName}
          onStart={startTour}
        />
      ) : null}

      {reportsSheet.mounted ? (
        <ReportsSheet
          bottomOffset={0}
          maxHeight={Math.min(sheetMaxHeight, windowHeight * 0.72)}
          onHeight={
            reportsActive || (!anySheetActive && reportsSheet.mounted) ? setPanelHeight : undefined
          }
          visible={reportsSheet.visible}
          onExited={reportsSheet.onExited}
          signedIn={userId != null}
          userId={userId}
          closures={closures}
          onCreateRoadClosure={startReport}
          onOpenClosure={(closureId) => {
            setTab("map");
            setDetailId(closureId);
          }}
          onSignIn={() => {
            setTab("map");
            setProfileOpen(true);
          }}
        />
      ) : null}

      {assistantSheet.mounted ? (
        <AssistantSheet
          bottomOffset={0}
          maxHeight={Math.min(440, sheetMaxHeight)}
          prompt={assistantPrompt}
          onPromptChange={(value) => {
            setAssistantPrompt(value);
            if (assistantError) setAssistantError(null);
          }}
          onSubmit={() => {
            void submitAssistant();
          }}
          onClose={closeAssistant}
          loading={assistantLoading}
          error={assistantError}
          mockLocationActive={mockLocationActive}
          onToggleMockLocation={toggleMockLocation}
          onHeight={
            assistantActive || (!anySheetActive && assistantSheet.mounted)
              ? setPanelHeight
              : undefined
          }
          visible={assistantSheet.visible}
          onExited={assistantSheet.onExited}
        />
      ) : null}

      {routeSheet.mounted ? (
        <RouteSheet
          bottomOffset={0}
          maxHeight={Math.min(sheetMaxHeight, windowHeight * 0.6)}
          onHeight={
            routeActive || (!anySheetActive && routeSheet.mounted) ? setPanelHeight : undefined
          }
          visible={routeSheet.visible}
          onExited={routeSheet.onExited}
          searchSlot={searchSlot}
          onPickSlot={pickSlot}
          originName={originName}
          destinationName={destinationName}
          onClearSlot={clearSlot}
          onSwap={swapEndpoints}
          onClose={clearRouteUi}
          locating={locating}
          onUseMyLocation={() => {
            void locateMe();
          }}
          pendingPresetName={pendingPreset?.name ?? null}
          distanceLabel={route ? formatDistance(route.distanceM) : null}
          durationLabel={
            route?.durationS != null ? formatDuration(route.durationS) : null
          }
          routeMeta={
            !route
              ? null
              : route.detail
                ? route.detail
                : [
                    mapTheme === "night" &&
                    streetProfile === "foot-walking" &&
                    route.mode === "campus" &&
                    route.darkM != null
                      ? route.darkM < 1
                        ? "toda iluminada"
                        : `${formatDistance(route.darkM)} sin luz`
                      : null,
                    route.mode === "campus"
                      ? "a pie"
                      : route.profile === "driving-car"
                        ? "en carro"
                        : route.profile === "cycling-regular"
                          ? "en bici"
                          : route.profile === "driving-motorcycle"
                            ? "en moto"
                            : "a pie",
                    route.mode === "campus" ? null : route.entrance ? `vía ${route.entrance.street}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
          }
          streetSourceLabel={route ? streetSourceLabel(route.streetSource) : null}
          nightChoiceOpen={nightChoiceOpen}
          onChooseWalkCost={(cost) => {
            if (!origin || !destination) return;
            void runRoute(origin, destination, streetProfileRef.current, cost);
          }}
          error={routeError}
          closureNotice={closureNotice}
          routing={routing}
          streetProfile={streetProfile}
          onStreetProfileChange={changeStreetProfile}
          presetName={preset?.name ?? null}
          presetStops={preset?.stops ?? null}
        />
      ) : null}
    </View>
  );
}
