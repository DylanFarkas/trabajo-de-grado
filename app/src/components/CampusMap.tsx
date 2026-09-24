import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { withUniwind } from "uniwind";
import * as Location from "expo-location";

import edificios from "@/assets/geojson/edificios.json";
import aristasRed from "@/assets/geojson/aristas_red.json";
import pasillos from "@/assets/geojson/pasillos.json";
import { CAMPUS_BOUNDS, MOCK_CAMPUS_LOCATION } from "@/constants/map";
import {
  CAMPUS_ENTRANCES,
  type CampusEntrance,
} from "@/constants/entrances";
import { floorsOf, catalogMapTone, listCampusPlaces, placeInfo, searchCampusPlaces, type CampusCatalog, type CampusPlace } from "@/places";
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
  type HybridRouteResult,
} from "@/routing/hybridRoute";
import type { StreetProfile } from "@/routing/openRouteService";
import type { BuildingProperties, GeoJsonFeatureCollection } from "@/types/campus";
import { MapHeader } from "@/components/MapHeader";
import { AssistantSheet } from "@/components/AssistantSheet";
import { RouteSheet, type RouteSlot } from "@/components/RouteSheet";

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

const METERS_PER_FLOOR = 3.2;

function withExtrusionHeight(
  collection: GeoJsonFeatureCollection,
  catalog: CampusCatalog | null,
): GeoJsonFeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const props = (feature.properties ?? {}) as BuildingProperties;
      const floors = floorsOf(props);
      const height_m = Math.max(floors * METERS_PER_FLOOR, METERS_PER_FLOOR);
      const code = props["addr:housenumber"] ? String(props["addr:housenumber"]) : null;
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
          floors,
          height_m,
          tone,
          label: String(label),
        },
      };
    }),
  };
}

function buildMapHtml(): string {
  const centerLat = (CAMPUS_BOUNDS.minLat + CAMPUS_BOUNDS.maxLat) / 2;
  const centerLon = (CAMPUS_BOUNDS.minLon + CAMPUS_BOUNDS.maxLon) / 2;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #dbe4ee; }
    .maplibregl-ctrl-attrib { font-size: 10px; }
    .route-marker {
      width: 30px; height: 30px; border-radius: 15px;
      border: 2.5px solid #fff; box-shadow: 0 6px 16px rgba(28,25,23,0.32);
      display: flex; align-items: center; justify-content: center;
      font: 800 12px system-ui, sans-serif; color: #fff;
    }
    .route-marker.origin { background: #111111; }
    .route-marker.dest { background: #2563eb; }
    .entrance-marker {
      width: 28px; height: 28px; border-radius: 14px;
      background: #111111; border: 2.5px solid #fff;
      box-shadow: 0 6px 14px rgba(17,17,17,0.28);
      display: flex; align-items: center; justify-content: center;
      font: 800 11px system-ui, sans-serif; color: #fff;
    }
    .user-marker {
      width: 18px; height: 18px; border-radius: 9px;
      background: #2563eb; border: 3px solid #fff;
      box-shadow: 0 0 0 6px rgba(37,99,235,0.22), 0 6px 14px rgba(17,17,17,0.28);
    }
    .maplibregl-ctrl-bottom-left { bottom: 130px; left: 12px; }
    .maplibregl-ctrl-group { border-radius: 14px !important; overflow: hidden; box-shadow: 0 8px 18px rgba(17,17,17,0.12); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    function post(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [${centerLon}, ${centerLat}],
      zoom: 16.2,
      pitch: 58,
      bearing: -28,
      maxPitch: 75,
      canvasContextAttributes: { antialias: true }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), 'bottom-left');

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
        duration: 700,
        essential: true
      });
    };

    var originMarker = null;
    var destMarker = null;
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

    window.setRouteEndpoints = function (origin, destination) {
      if (origin) setMarker('origin', origin.longitude, origin.latitude);
      else if (originMarker) { originMarker.remove(); originMarker = null; }
      if (destination) setMarker('dest', destination.longitude, destination.latitude);
      else if (destMarker) { destMarker.remove(); destMarker = null; }
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

    window.clearRouteLine = function () {
      if (map.getLayer('route-line')) map.removeLayer('route-line');
      if (map.getLayer('route-casing')) map.removeLayer('route-casing');
      if (map.getLayer('route-glow')) map.removeLayer('route-glow');
      if (map.getSource('route')) map.removeSource('route');
    };

    window.clearRoute = function () {
      if (originMarker) { originMarker.remove(); originMarker = null; }
      if (destMarker) { destMarker.remove(); destMarker = null; }
      if (typeof window.setSelectedBuilding === 'function') window.setSelectedBuilding(null);
      window.clearRouteLine();
    };

    window.setRouteLine = function (coordinates) {
      if (!coordinates || coordinates.length < 2) {
        window.clearRouteLine();
        return;
      }
      var data = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coordinates }
      };
      if (map.getSource('route')) {
        map.getSource('route').setData(data);
      } else {
        map.addSource('route', { type: 'geojson', data: data });
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 12, 'line-opacity': 0.95 }
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#2563eb', 'line-width': 5.5, 'line-opacity': 0.98 }
        });
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#93c5fd', 'line-width': 16, 'line-opacity': 0.28, 'line-blur': 6 }
        }, 'route-casing');
      }
      var bounds = coordinates.reduce(function (b, c) {
        return b.extend(c);
      }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
      map.fitBounds(bounds, {
        padding: { top: 130, bottom: 320, left: 36, right: 56 },
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

    window.loadCampusLayers = function (buildings, paths, passages) {
      [
        'buildings-labels', 'buildings-3d', 'buildings-footprint', 'buildings-hit',
        'paths-line', 'paths-mid', 'paths-casing', 'paths-glow',
        'pasillos-line', 'pasillos-casing'
      ].forEach(function (id) {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource('buildings')) map.removeSource('buildings');
      if (map.getSource('paths')) map.removeSource('paths');
      if (map.getSource('pasillos')) map.removeSource('pasillos');

      const beforeId = firstSymbolLayerId();

      map.addSource('paths', { type: 'geojson', data: paths });
      map.addLayer({
        id: 'paths-casing', type: 'line', source: 'paths',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#6f7f6a',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            15, 2.2,
            17, 4.0,
            19, 5.5
          ],
          'line-opacity': 0.38
        }
      }, beforeId);
      map.addLayer({
        id: 'paths-line', type: 'line', source: 'paths',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#9aab92',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            15, 1.4,
            17, 2.6,
            19, 3.6
          ],
          'line-opacity': 0.72
        }
      }, beforeId);

      map.addSource('buildings', { type: 'geojson', data: buildings, promoteId: 'fid' });
      map.addLayer({
        id: 'buildings-hit', type: 'fill', source: 'buildings',
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.01 }
      }, beforeId);
      map.addLayer({
        id: 'buildings-footprint', type: 'fill', source: 'buildings',
        paint: {
          'fill-color': '#5b6672',
          'fill-opacity': 0.14,
          'fill-translate': [2, 4]
        }
      }, beforeId);
      map.addLayer({
        id: 'buildings-3d', type: 'fill-extrusion', source: 'buildings',
        paint: {
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#950606',
            [
              'match', ['get', 'tone'],
              'library', '#e8eef1',
              'food', '#efe8de',
              'culture', '#ebe6ea',
              'sport', '#e2ebe5',
              'tower', '#d0cbc3',
              'mid', '#ddd8d0',
              '#e7e2d9'
            ]
          ],
          'fill-extrusion-height': ['get', 'height_m'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.96,
          'fill-extrusion-vertical-gradient': true
        }
      }, beforeId);
      map.addLayer({
        id: 'buildings-labels', type: 'symbol', source: 'buildings',
        minzoom: 16.2,
        layout: {
          'text-field': ['coalesce', ['get', 'label'], ''],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            16.2, 10,
            18, 12.5
          ],
          'text-anchor': 'center',
          'text-max-width': 8,
          'text-allow-overlap': false,
          'symbol-sort-key': ['*', -1, ['get', 'height_m']]
        },
        paint: {
          'text-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#ffffff',
            '#3a424c'
          ],
          'text-halo-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            'rgba(17,17,17,0.88)',
            'rgba(248,250,252,0.94)'
          ],
          'text-halo-width': 1.5
        }
      });

      if (passages && passages.features && passages.features.length) {
        map.addSource('pasillos', { type: 'geojson', data: passages });
        map.addLayer({
          id: 'pasillos-casing', type: 'line', source: 'pasillos',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#ffffff',
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
            'line-color': '#6d5b95',
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

      map.fitBounds(
        [[${CAMPUS_BOUNDS.minLon}, ${CAMPUS_BOUNDS.minLat}], [${CAMPUS_BOUNDS.maxLon}, ${CAMPUS_BOUNDS.maxLat}]],
        { padding: 48, pitch: 58, bearing: -28, duration: 900 }
      );

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
  const webRef = useRef<WebView>(null);
  const [status, setStatus] = useState("Cargando mapa…");
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [originName, setOriginName] = useState<string | null>(null);
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [route, setRoute] = useState<HybridRouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [mockLocationActive, setMockLocationActive] = useState(false);
  const [activeSlot, setActiveSlot] = useState<RouteSlot>("origin");
  const [view3d, setView3d] = useState(true);
  const [selected, setSelected] = useState<SelectedBuilding | null>(null);
  const [catalog, setCatalog] = useState<CampusCatalog | null>(null);
  const [locating, setLocating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [userOutsideCampus, setUserOutsideCampus] = useState(false);
  const [campusPickerOpen, setCampusPickerOpen] = useState(false);
  const [relocatingEntranceId, setRelocatingEntranceId] = useState<string | null>(null);
  const [entranceOverrides, setEntranceOverrides] = useState<Record<string, LatLng>>({});
  const [streetProfile, setStreetProfile] = useState<StreetProfile>("foot-walking");
  const activeSlotRef = useRef<RouteSlot>(activeSlot);
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

  const selectSlot = useCallback((slot: RouteSlot) => {
    activeSlotRef.current = slot;
    setActiveSlot(slot);
  }, []);

  const html = useMemo(() => buildMapHtml(), []);
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
    const payload = JSON.stringify({ buildings, paths, passages });
    inject(`
      try {
        var data = ${payload};
        if (typeof window.loadCampusLayers === 'function') {
          window.loadCampusLayers(data.buildings, data.paths, data.passages);
        }
      } catch (e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
        }
      }
    `);
  }, [buildings, paths, passages, inject]);

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
      const name = label ?? placeInfo(building, catalog).title;
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
    [origin, destination, originName, destinationName, runRoute, syncMarkers, clearRouteLine, catalog],
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

  const chooseSearchResult = useCallback(
    (place: CampusPlace) => {
      Keyboard.dismiss();
      const toward = activeSlotRef.current === "destination" ? origin : destination;
      assignPoint(activeSlotRef.current, place.point, place.building);
      focusPlace(pointForBuilding(place.building, place.point, toward));
    },
    [assignPoint, focusPlace, origin, destination],
  );

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
      setOrigin(point);
      setOriginName("Mi ubicación");
      setQuery("");
      // Solo muestra ubicación; no calcula ruta todavía.
      setRoute(null);
      setRouteError(null);
      clearRouteLine();
      syncMarkers(point, destination);
      activeSlotRef.current = "destination";
      setActiveSlot("destination");

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
  }, [locating, routing, inject, destination, syncMarkers, clearRouteLine]);

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

  const openAssistant = useCallback(() => {
    setAssistantError(null);
    setAssistantOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    if (assistantLoading) return;
    setAssistantOpen(false);
    setAssistantError(null);
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
      setAssistantOpen(false);
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
          injectLayers();
        } else if (data.type === "ready") {
          setStatus("");
        } else if (data.type === "view-mode") {
          setView3d(data.mode !== "2d");
        } else if (data.type === "map-click") {
          Keyboard.dismiss();
          setQuery("");
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
            const slot = activeSlotRef.current;
            if (data.building) {
              showBuilding(point, data.building);
            } else {
              assignPoint(slot, point, null);
            }
          }
        } else if (data.type === "error") {
          setStatus(data.message || "Error al cargar capas");
        }
      } catch {
        // ignore
      }
    },
    [injectLayers, assignPoint, showBuilding],
  );

  return (
    <View className="flex-1 bg-[#dbe4ee]">
      <UniWebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html }}
        className="z-0 flex-1 bg-[#dbe4ee]"
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

      <MapHeader
        topInset={insets.top}
        status={status}
        query={query}
        onQueryChange={setQuery}
        results={results}
        onSelectResult={chooseSearchResult}
        activeSlot={activeSlot}
        view3d={view3d}
        onToggleView={toggleView}
        locating={locating}
        onLocate={locateMe}
        onOpenAssistant={openAssistant}
        assistantActive={assistantOpen || mockLocationActive}
      />

      <AssistantSheet
        visible={assistantOpen}
        topInset={insets.top}
        bottomInset={insets.bottom}
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
      />

      <RouteSheet
        bottomInset={insets.bottom}
        activeSlot={activeSlot}
        onSelectSlot={selectSlot}
        originName={originName}
        destinationName={destinationName}
        onClearSlot={clearSlot}
        onSwap={swapEndpoints}
        onClearAll={clearRouteUi}
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
        place={
          selectedInfo && selected
            ? {
                title: selectedInfo.title,
                subtitle: selectedInfo.subtitle,
                code: selectedInfo.code,
                categories: selectedInfo.categories,
                detail: selectedInfo.detail,
              }
            : null
        }
        onClosePlace={() => setSelected(null)}
        onUsePlace={useSelected}
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
      />
    </View>
  );
}
