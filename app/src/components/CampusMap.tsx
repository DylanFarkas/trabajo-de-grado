import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { withUniwind } from "uniwind";
import * as Location from "expo-location";

import edificios from "@/assets/geojson/edificios.json";
import aristasRed from "@/assets/geojson/aristas_red.json";
import pasillos from "@/assets/geojson/pasillos.json";
import postes from "@/assets/geojson/postes.json";
import { BUILDING_HEIGHT_OVERRIDES, CAMPUS_BOUNDS, MOCK_CAMPUS_LOCATION } from "@/constants/map";
import {
  LAMP_KINDS,
  MAP_BACKDROP,
  MAP_PALETTES,
  MAP_STYLE_URLS,
  type MapTheme,
} from "@/constants/mapTheme";
import { useMapTheme } from "@/map-theme";
import {
  CAMPUS_ENTRANCES,
  type CampusEntrance,
} from "@/constants/entrances";
import { catalogMapTone, categoriesForCode, listCampusPlaces, placeInfo, searchCampusPlaces, type CampusCatalog, type CampusPlace, type PresetRoute } from "@/places";
import { readCachedCatalog, refreshCatalog } from "@/catalog";
import {
  buildPlaceCatalog,
  findPlaceById,
  parseRouteIntent,
  RouteIntentError,
} from "@/routing/deepseekIntent";
import {
  entrancePoint,
  formatDistance,
  nearestNodeId,
  nodeLatLng,
  type LatLng,
} from "@/routing/graph";
import {
  formatDuration,
  pointInCampus,
  routeHybrid,
  orderStopsFromOrigin,
  pointLetter,
  routeThroughPoints,
  type HybridRouteResult,
} from "@/routing/hybridRoute";
import type { StreetProfile } from "@/routing/openRouteService";
import type { BuildingProperties, GeoJsonFeatureCollection } from "@/types/campus";
import { MapHeader } from "@/components/MapHeader";
import { AssistantSheet } from "@/components/AssistantSheet";
import { ExploreSheet } from "@/components/ExploreSheet";
import { homeTabBarHeight } from "@/components/HomeTabs";
import { MapControls } from "@/components/MapControls";
import { RouteSheet, type RouteSlot } from "@/components/RouteSheet";
import { useSheetPresence } from "@/components/SnapSheet";
import { ToursSheet } from "@/components/ToursSheet";
import { useMapPanel, type MapPanel } from "@/map-panel";

const UniWebView = withUniwind(WebView);

type SelectedBuilding = {
  snapped: LatLng;
  building: BuildingProperties;
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
    var routeCoords = null;
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

    function removeRouteLayers() {
      if (map.getLayer('route-line')) map.removeLayer('route-line');
      if (map.getLayer('route-casing')) map.removeLayer('route-casing');
      if (map.getLayer('route-glow')) map.removeLayer('route-glow');
      if (map.getSource('route')) map.removeSource('route');
    }

    function drawRouteLine() {
      if (!routeCoords) {
        removeRouteLayers();
        return;
      }
      var data = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: routeCoords }
      };
      if (map.getSource('route') && map.getLayer('route-line')) {
        map.getSource('route').setData(data);
        return;
      }
      removeRouteLayers();
      var colors = palette();
      map.addSource('route', { type: 'geojson', data: data });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': colors.routeGlow,
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
        paint: { 'line-color': colors.routeLine, 'line-width': 5.5, 'line-opacity': 0.98 }
      });
    }

    window.clearRouteLine = function () {
      routeCoords = null;
      removeRouteLayers();
    };

    window.clearRoute = function () {
      if (originMarker) { originMarker.remove(); originMarker = null; }
      if (destMarker) { destMarker.remove(); destMarker = null; }
      clearStopMarkers();
      if (typeof window.setSelectedBuilding === 'function') window.setSelectedBuilding(null);
      window.clearRouteLine();
    };

    window.setRouteLine = function (coordinates) {
      if (!coordinates || coordinates.length < 2) {
        window.clearRouteLine();
        return;
      }
      routeCoords = coordinates;
      if (!styleBusy) drawRouteLine();
      var bounds = coordinates.reduce(function (b, c) {
        return b.extend(c);
      }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
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
      'buildings-labels', 'lamp-bulb', 'lamp-3d', 'buildings-selected', 'buildings-3d',
      'buildings-footprint', 'buildings-hit', 'campus-building-3d',
      'lamp-core', 'lamp-glow', 'lamp-pool',
      'steps-line', 'foot-line', 'foot-casing', 'service-line', 'service-casing',
      'pasillos-line', 'pasillos-casing'
    ];
    var CAMPUS_SOURCES = ['lamp-models', 'lamps', 'buildings', 'paths', 'pasillos'];

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

      if (selectedBuildingId != null) {
        try {
          map.setFeatureState({ source: 'buildings', id: selectedBuildingId }, { selected: true });
        } catch (e) {}
      }

      drawRouteLine();
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

    map.on('style.load', function () {
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

    window.loadCampusLayers = function (buildings, paths, passages, lamps) {
      campus = {
        buildings: buildings,
        paths: paths,
        passages: passages,
        lamps: lamps || { type: 'FeatureCollection', features: [] }
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
      var pad = 12;
      var bbox = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
      var hitLayers = [];
      if (map.getLayer('buildings-hit')) hitLayers.push('buildings-hit');
      if (map.getLayer('buildings-3d')) hitLayers.push('buildings-3d');
      var building = hitLayers.length
        ? map.queryRenderedFeatures(bbox, { layers: hitLayers })[0]
        : null;
      post({
        type: 'map-click',
        longitude: e.lngLat.lng,
        latitude: e.lngLat.lat,
        building: building ? (building.properties || null) : null
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
  const { panel: tab, setPanel: setTab, registerSelectMapTab, openPlaceDetails } = useMapPanel();
  const [panelHeight, setPanelHeight] = useState(0);
  const [pickingSlot, setPickingSlot] = useState<RouteSlot | null>(null);
  const [pendingPreset, setPendingPreset] = useState<PresetRoute | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [mockLocationActive, setMockLocationActive] = useState(false);
  const [activeSlot, setActiveSlot] = useState<RouteSlot>("origin");
  const [view3d, setView3d] = useState(true);
  const [selected, setSelected] = useState<SelectedBuilding | null>(null);
  const [catalog, setCatalog] = useState<CampusCatalog | null>(null);
  const [preset, setPreset] = useState<{ name: string; stops: { letter: string; name: string }[] } | null>(null);
  const [locating, setLocating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [userOutsideCampus, setUserOutsideCampus] = useState(false);
  const [campusPickerOpen, setCampusPickerOpen] = useState(false);
  const [relocatingEntranceId, setRelocatingEntranceId] = useState<string | null>(null);
  const [entranceOverrides, setEntranceOverrides] = useState<Record<string, LatLng>>({});
  const [streetProfile, setStreetProfile] = useState<StreetProfile>("foot-walking");
  const { mode: themeMode, theme: mapTheme, initialTheme, setMode: setThemeMode } = useMapTheme();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const webThemeRef = useRef<MapTheme | null>(null);
  const activeSlotRef = useRef<RouteSlot>(activeSlot);
  const tabRef = useRef<MapPanel>(tab);
  const chromeBottomRef = useRef(220);
  const searchSlotRef = useRef<RouteSlot | null>("destination");
  const inTripRef = useRef(false);
  const pendingPresetRef = useRef<PresetRoute | null>(null);
  const selectedRef = useRef<SelectedBuilding | null>(null);
  const routeRequestRef = useRef(0);
  const relocatingRef = useRef<string | null>(null);
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
    relocatingRef.current = relocatingEntranceId;
  }, [relocatingEntranceId]);

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

  const entrances = useMemo<CampusEntrance[]>(
    () =>
      CAMPUS_ENTRANCES.map((entrance) => ({
        ...entrance,
        point: entranceOverrides[entrance.id] ?? entrance.point,
      })),
    [entranceOverrides],
  );

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
  const lamps = useMemo(() => postes, []);
  const places = useMemo(
    () => listCampusPlaces(edificios as unknown as GeoJsonFeatureCollection, catalog),
    [catalog],
  );
  const placeCatalog = useMemo(() => buildPlaceCatalog(places), [places]);
  const results = useMemo(() => searchCampusPlaces(places, query, 4), [places, query]);
  const selectedInfo = useMemo(
    () => (selected ? placeInfo(selected.building, catalog) : null),
    [selected, catalog],
  );

  const inject = useCallback((code: string) => {
    webRef.current?.injectJavaScript(`(function(){${code}; true;})();`);
  }, []);

  useEffect(() => {
    const fid = selected?.building?.fid;
    const value = fid == null || Number.isNaN(Number(fid)) ? "null" : String(Number(fid));
    inject(
      `if (typeof window.setSelectedBuilding === 'function') window.setSelectedBuilding(${value});`,
    );
  }, [selected, inject]);

  const injectLayers = useCallback(() => {
    const payload = JSON.stringify({ buildings, paths, passages, lamps });
    inject(`
      try {
        var data = ${payload};
        if (typeof window.loadCampusLayers === 'function') {
          window.loadCampusLayers(data.buildings, data.paths, data.passages, data.lamps);
        }
      } catch (e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
        }
      }
    `);
  }, [buildings, paths, passages, lamps, inject]);

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
      });
      inject(`
        var data = ${payload};
        if (typeof window.setRouteEndpoints === 'function') {
          window.setRouteEndpoints(data.origin, data.destination);
        }
        if (typeof window.setRouteLine === 'function') {
          window.setRouteLine(data.coordinates);
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
      viaEntrance: LatLng | null = null,
      profile: StreetProfile = streetProfileRef.current,
    ) => {
      const sameCampusNode =
        pointInCampus(from) &&
        pointInCampus(to) &&
        nearestNodeId(from) != null &&
        nearestNodeId(from) === nearestNodeId(to);
      if (sameCampusNode) {
        setRoute(null);
        setRouteError("Elige dos lugares distintos");
        syncMarkers(from, to);
        clearRouteLine();
        return;
      }

      const requestId = ++routeRequestRef.current;
      setPreset(null);
      setRouting(true);
      setRouteError(null);
      setStatus(
        profile === "driving-car" ? "Calculando ruta en carro…" : "Calculando ruta a pie…",
      );

      try {
        const result = await routeHybrid(from, to, profile, viaEntrance);
        if (requestId !== routeRequestRef.current) return;
        if (!result) {
          setRoute(null);
          setRouteError("No hay camino entre esos puntos");
          syncMarkers(from, to);
          clearRouteLine();
          return;
        }
        setRoute({ ...result, profile });
        setRouteError(null);
        paintRoute(result);
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
        const message =
          error instanceof Error ? error.message : "No se pudo calcular la ruta";
        setRouteError(message);
        setStatus("");
      } finally {
        if (requestId === routeRequestRef.current) setRouting(false);
      }
    },
    [syncMarkers, paintRoute, clearRouteLine],
  );

  const runPreset = useCallback(
    (presetRoute: PresetRoute, fromPoint?: LatLng, fromName?: string) => {
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
        const place = places.find((item) => item.code === code);
        if (!place) return [];
        return [{ name: place.title, point: place.point }];
      });
      const missing = presetRoute.stops.find(
        (code) => !places.some((item) => item.code === code),
      );
      if (missing || resolved.length < 2) {
        const label = missing ? (catalog?.places[missing]?.name ?? missing) : null;
        setPreset(null);
        setRoute(null);
        setRouteError(
          label ? `${label} no está en el mapa` : "La ruta necesita al menos dos sitios",
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
    [origin, originName, places, catalog, clearRouteLine, inject],
  );

  const syncEntranceMarkers = useCallback(
    (items: CampusEntrance[] | null) => {
      const payload = JSON.stringify(
        (items ?? []).map((e) => ({
          longitude: e.point.longitude,
          latitude: e.point.latitude,
          name: e.name,
        })),
      );
      inject(`
        if (typeof window.setEntranceMarkers === 'function') {
          window.setEntranceMarkers(${payload});
        }
      `);
    },
    [inject],
  );

  useEffect(() => {
    if (campusPickerOpen) syncEntranceMarkers(entrances);
    else syncEntranceMarkers(null);
  }, [campusPickerOpen, entrances, syncEntranceMarkers]);

  const clearRouteUi = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setOriginName(null);
    setDestinationName(null);
    setPreset(null);
    setRoute(null);
    setRouteError(null);
    setAssistantError(null);
    setCampusPickerOpen(false);
    setRelocatingEntranceId(null);
    activeSlotRef.current = "origin";
    setActiveSlot("origin");
    setQuery("");
    setAssistantPrompt("");
    setAssistantError(null);
    setSelected(null);
    setPendingPreset(null);
    setPickingSlot(null);
    inject(`if (typeof window.clearRoute === 'function') window.clearRoute();`);
    inject(`if (typeof window.setEntranceMarkers === 'function') window.setEntranceMarkers([]);`);
  }, [inject]);

  const assignPoint = useCallback(
    (
      slot: RouteSlot,
      point: LatLng,
      building: BuildingProperties | null,
      label?: string | null,
    ) => {
      const toward = slot === "destination" ? origin : destination;
      const snapped = pointForBuilding(building, point, toward);
      setSelected(null);
      setPickingSlot(null);
      const name = label ?? placeInfo(building, catalog).title;
      const pending = pendingPresetRef.current;
      if (slot === "origin" && pending) {
        runPreset(pending, snapped, name);
        return;
      }
      const nextOrigin = slot === "origin" ? snapped : origin;
      const nextDestination = slot === "destination" ? snapped : destination;
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

      setRoute(null);
      setRouteError(null);
      const nextSlot: RouteSlot = nextOrigin ? "destination" : "origin";
      activeSlotRef.current = nextSlot;
      setActiveSlot(nextSlot);
      syncMarkers(nextOrigin, nextDestination);
      clearRouteLine();
    },
    [origin, destination, originName, destinationName, runRoute, runPreset, syncMarkers, clearRouteLine, catalog],
  );

  const clearSlot = useCallback(
    (slot: RouteSlot) => {
      const nextOrigin = slot === "origin" ? null : origin;
      const nextDestination = slot === "destination" ? null : destination;
      if (slot === "origin") setOriginName(null);
      else setDestinationName(null);
      setOrigin(nextOrigin);
      setDestination(nextDestination);
      setRoute(null);
      setRouteError(null);
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
    const nextOrigin = destination;
    const nextDestination = origin;
    setOrigin(nextOrigin);
    setDestination(nextDestination);
    setOriginName(destinationName);
    setDestinationName(originName);
    if (nextOrigin && nextDestination) {
      void runRoute(nextOrigin, nextDestination);
      return;
    }
    setRoute(null);
    setRouteError(null);
    const nextSlot: RouteSlot = nextOrigin ? "destination" : "origin";
    activeSlotRef.current = nextSlot;
    setActiveSlot(nextSlot);
    syncMarkers(nextOrigin, nextDestination);
    clearRouteLine();
  }, [origin, destination, originName, destinationName, runRoute, syncMarkers, clearRouteLine]);

  const showBuilding = useCallback(
    (point: LatLng, building: BuildingProperties) => {
      const snapped = pointForBuilding(building, point, origin ?? destination);
      setSelected({ snapped, building });
      focusPlace(snapped);
    },
    [focusPlace, origin, destination],
  );

  const useSelected = useCallback(
    (slot: RouteSlot) => {
      const current = selectedRef.current;
      if (!current) return;
      assignPoint(slot, current.snapped, current.building);
    },
    [assignPoint],
  );

  const openSelectedDetails = useCallback(() => {
    const info = selectedInfo;
    if (!info?.code) return;
    openPlaceDetails({
      code: info.code,
      title: info.title,
      subtitle: info.subtitle,
      categories: info.categories,
      description: catalog?.places[info.code]?.description ?? null,
      tone: categoriesForCode(info.code, catalog)[0]?.tone ?? null,
    });
  }, [selectedInfo, catalog, openPlaceDetails]);

  const chooseSearchResult = useCallback(
    (place: CampusPlace) => {
      Keyboard.dismiss();
      const slot = searchSlotRef.current ?? "destination";
      const toward = slot === "destination" ? origin : destination;
      assignPoint(slot, place.point, place.building);
      focusPlace(pointForBuilding(place.building, place.point, toward));
    },
    [assignPoint, focusPlace, origin, destination],
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
      setCampusPickerOpen(false);
      setRelocatingEntranceId(null);
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
        setStatus("Ubicación lista · elige Ir al campus");
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
    setCampusPickerOpen(false);
    setRelocatingEntranceId(null);
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

  const closeAssistant = useCallback(() => {
    if (assistantLoading) return;
    setAssistantError(null);
    setTab("map");
  }, [assistantLoading]);

  const submitAssistant = useCallback(async () => {
    if (assistantLoading || routing) return;
    const text = assistantPrompt.trim();
    if (!text) {
      setAssistantError("Escribe a dónde quieres ir, ej: desde E19 al B13");
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

      if (intent.clarification && !intent.destinationPlaceId) {
        setAssistantError(intent.clarification);
        setStatus("");
        return;
      }

      const destinationPlace = findPlaceById(places, intent.destinationPlaceId);
      if (!destinationPlace) {
        setAssistantError(
          intent.clarification ??
            "No reconocí el destino. Prueba con un código o nombre del campus (ej: B13).",
        );
        setStatus("");
        return;
      }

      const originPlace = findPlaceById(places, intent.originPlaceId);
      let nextOrigin: LatLng | null = originPlace?.point ?? null;
      let nextOriginName: string | null = originPlace
        ? placeInfo(originPlace.building, catalog).title
        : null;

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
          "Indica el origen (ej: desde E19 al B13) o activa «Ubicación de prueba» abajo.",
        );
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

      const to = pointForBuilding(destinationPlace.building, destinationPlace.point, nextOrigin);
      const from = originPlace
        ? pointForBuilding(originPlace.building, nextOrigin, to)
        : snapCampusPoint(nextOrigin);
      const fromName = nextOriginName ?? "Origen";
      const toName = placeInfo(destinationPlace.building, catalog).title;

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
      await runRoute(from, to, null, streetProfileRef.current);
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
  }, [assistantLoading, routing, assistantPrompt, placeCatalog, places, runRoute, catalog]);

  const openCampusPicker = useCallback(() => {
    setCampusPickerOpen(true);
    setRelocatingEntranceId(null);
    setSelected(null);
    setStatus("Elige una entrada");
  }, []);

  const closeCampusPicker = useCallback(() => {
    setCampusPickerOpen(false);
    setRelocatingEntranceId(null);
    setStatus("");
  }, []);

  const startRelocateEntrance = useCallback((entranceId: string) => {
    setRelocatingEntranceId(entranceId);
    const entrance = CAMPUS_ENTRANCES.find((e) => e.id === entranceId);
    setStatus(
      entrance
        ? `Toca el mapa para ubicar ${entrance.street}`
        : "Toca el mapa para ubicar la entrada",
    );
  }, []);

  const selectEntrance = useCallback(
    async (entrance: CampusEntrance) => {
      if (!userLocation) {
        setRouteError("Primero detecta tu ubicación");
        return;
      }
      setCampusPickerOpen(false);
      setRelocatingEntranceId(null);
      setDestination(entrance.point);
      setDestinationName(entrance.name);
      setOrigin(userLocation);
      setOriginName("Mi ubicación");
      activeSlotRef.current = "destination";
      setActiveSlot("destination");
      await runRoute(userLocation, entrance.point, entrance.point, streetProfile);
    },
    [userLocation, runRoute, streetProfile],
  );


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
        } else if (data.type === "map-click") {
          Keyboard.dismiss();
          setQuery("");
          setThemeMenuOpen(false);
          if (typeof data.longitude === "number" && typeof data.latitude === "number") {
            const point = { longitude: data.longitude, latitude: data.latitude };
            const relocatingId = relocatingRef.current;
            if (relocatingId) {
              setEntranceOverrides((prev) => ({ ...prev, [relocatingId]: point }));
              setRelocatingEntranceId(null);
              const entrance = CAMPUS_ENTRANCES.find((e) => e.id === relocatingId);
              const lon = point.longitude.toFixed(7);
              const lat = point.latitude.toFixed(7);
              setStatus(
                `${entrance?.street ?? "Entrada"} → lon ${lon}, lat ${lat} (cópialo a entrances.ts)`,
              );
              return;
            }
            const slot = inTripRef.current && tabRef.current === "map" ? searchSlotRef.current : null;
            if (slot) {
              assignPoint(slot, point, data.building ?? null);
            } else if (data.building) {
              setCampusPickerOpen(false);
              showBuilding(point, data.building);
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
    [injectLayers, assignPoint, showBuilding, inject],
  );

  const startTour = useCallback(
    (tour: PresetRoute) => {
      setTab("map");
      setSelected(null);
      setCampusPickerOpen(false);
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
      catalog?.places[code]?.name ?? places.find((place) => place.code === code)?.title ?? code,
    [catalog, places],
  );

  const inTrip = Boolean(origin || destination || preset || pendingPreset || campusPickerOpen);

  const changeTab = useCallback((next: MapPanel) => {
    setQuery("");
    Keyboard.dismiss();

    if (next === tab) {
      if (tab === "assistant") {
        closeAssistant();
        return;
      }
      if (tab === "tours") {
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
  }, [tab, selected, inTrip, closeAssistant, clearRouteUi, setTab]);

  useEffect(() => registerSelectMapTab(changeTab), [registerSelectMapTab, changeTab]);

  const searchSlot: RouteSlot | null = !inTrip
    ? "destination"
    : campusPickerOpen || preset
      ? null
      : pickingSlot ??
        (!origin ? "origin" : !destination && !pendingPreset ? "destination" : null);
  inTripRef.current = inTrip;
  searchSlotRef.current = searchSlot;

  const showSearch = tab === "map" && !selected && searchSlot != null;
  const searchPlaceholder =
    searchSlot === "origin"
      ? "¿Desde dónde sales?"
      : inTrip && destinationName
        ? "Cambiar destino"
        : "¿A dónde vas?";

  const placePreview =
    selectedInfo && selected
      ? {
          title: selectedInfo.title,
          subtitle: selectedInfo.subtitle,
          code: selectedInfo.code,
          categories: selectedInfo.categories,
          detail: selectedInfo.detail,
        }
      : null;
  const lastPlacePreview = useRef(placePreview);
  if (placePreview) lastPlacePreview.current = placePreview;

  const exploreActive = tab === "map" && Boolean(placePreview);
  const toursActive = tab === "tours";
  const assistantActive = tab === "assistant";
  const routeActive = tab === "map" && !placePreview && inTrip;
  const anySheetActive = exploreActive || toursActive || assistantActive || routeActive;
  const exploreSheet = useSheetPresence(exploreActive);
  const toursSheet = useSheetPresence(toursActive);
  const assistantSheet = useSheetPresence(assistantActive);
  const routeSheet = useSheetPresence(routeActive);
  const shownPlace = placePreview ?? (exploreSheet.mounted ? lastPlacePreview.current : null);

  const tabBarHeight = homeTabBarHeight(insets.bottom);
  const headerBlock = insets.top + (showSearch ? 72 : 16);
  const sheetMaxHeight = Math.max(260, windowHeight - headerBlock - tabBarHeight - 72);
  const chromeBottom = panelHeight;
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
              : route.mode === "campus"
                ? "a pie"
                : [
                    route.profile === "driving-car" ? "en carro" : "a pie",
                    route.entrance ? `vía ${route.entrance.street}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
          }
          error={routeError}
          showGoToCampus={Boolean(userLocation && userOutsideCampus && !routing)}
          campusPickerOpen={campusPickerOpen}
          entrances={entrances}
          relocatingEntranceId={relocatingEntranceId}
          onOpenCampusPicker={openCampusPicker}
          onCloseCampusPicker={closeCampusPicker}
          onSelectEntrance={selectEntrance}
          onRelocateEntrance={startRelocateEntrance}
          routing={routing}
          streetProfile={streetProfile}
          onStreetProfileChange={setStreetProfile}
          presetName={preset?.name ?? null}
          presetStops={preset?.stops ?? null}
        />
      ) : null}
    </View>
  );
}
