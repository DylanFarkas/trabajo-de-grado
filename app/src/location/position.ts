import * as Location from "expo-location";
import { useEffect, useState } from "react";

import { distanceToSegmentM, type LatLng, type SegmentKey } from "@/routing/graph";

/** De dónde sale el punto: el origen elegido a mano, la ubicación de prueba o el GPS. */
export type PositionSource = "manual" | "mock" | "gps";

export type EffectivePosition = {
  point: LatLng;
  source: PositionSource;
  /** Radio de error del GPS en metros. `null` cuando el punto es simulado. */
  accuracyM: number | null;
  isSimulated: boolean;
  /** Epoch ms de la lectura. */
  at: number;
};

/**
 * `simulated`: valida cierres como si el usuario estuviera en la ubicación de prueba
 * o en el punto A. `gps`: solo cuenta la ubicación real del teléfono.
 */
export type PositionMode = "simulated" | "gps";

export const POSITION_MODE: PositionMode =
  process.env.EXPO_PUBLIC_POSITION_MODE === "gps" ? "gps" : "simulated";

/** A esta distancia o menos del tramo, el reporte o voto cuenta como hecho en el sitio. */
export const ON_SITE_RADIUS_M = 75;
/** Con más error que esto, una lectura de GPS no prueba que el usuario esté ahí. */
export const GPS_MAX_ACCURACY_M = 30;

/** Lo que la pantalla del mapa sabe hoy. El proveedor decide qué usar. */
export type PositionInputs = {
  /** Punto A de la ruta. */
  manualPoint: LatLng | null;
  /** Ubicación de prueba activa, si la hay. */
  mockPoint: LatLng | null;
};

export type PositionProvider = {
  mode: PositionMode;
  /** Avisa cada cambio de posición. Devuelve la función para dejar de escuchar. */
  subscribe(
    inputs: PositionInputs,
    onChange: (position: EffectivePosition | null) => void,
  ): () => void;
};

const simulatedProvider: PositionProvider = {
  mode: "simulated",
  subscribe(inputs, onChange) {
    const at = Date.now();
    if (inputs.mockPoint) {
      onChange({ point: inputs.mockPoint, source: "mock", accuracyM: null, isSimulated: true, at });
    } else if (inputs.manualPoint) {
      onChange({
        point: inputs.manualPoint,
        source: "manual",
        accuracyM: null,
        isSimulated: true,
        at,
      });
    } else {
      onChange(null);
    }
    return () => {};
  },
};

const gpsProvider: PositionProvider = {
  mode: "gps",
  subscribe(_inputs, onChange) {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        onChange(null);
        return;
      }
      const next = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (reading) => {
          onChange({
            point: { latitude: reading.coords.latitude, longitude: reading.coords.longitude },
            source: "gps",
            accuracyM: reading.coords.accuracy ?? null,
            isSimulated: false,
            at: reading.timestamp,
          });
        },
      );
      if (cancelled) next.remove();
      else subscription = next;
    })().catch(() => {
      if (!cancelled) onChange(null);
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  },
};

export function positionProvider(mode: PositionMode = POSITION_MODE): PositionProvider {
  return mode === "gps" ? gpsProvider : simulatedProvider;
}

/** Posición con la que se validan reportes y votos. */
export function useEffectivePosition(
  inputs: PositionInputs,
  enabled = true,
): EffectivePosition | null {
  const provider = positionProvider();
  const [position, setPosition] = useState<EffectivePosition | null>(null);
  const manualLat = inputs.manualPoint?.latitude;
  const manualLon = inputs.manualPoint?.longitude;
  const mockLat = inputs.mockPoint?.latitude;
  const mockLon = inputs.mockPoint?.longitude;

  useEffect(() => {
    if (!enabled) return;
    const pointOf = (latitude?: number, longitude?: number): LatLng | null =>
      latitude != null && longitude != null ? { latitude, longitude } : null;
    return provider.subscribe(
      { manualPoint: pointOf(manualLat, manualLon), mockPoint: pointOf(mockLat, mockLon) },
      setPosition,
    );
  }, [enabled, provider, manualLat, manualLon, mockLat, mockLon]);

  return enabled ? position : null;
}

/** El GPS tiene que ser preciso. El modo simulado siempre se cree. */
export function positionIsTrusted(position: EffectivePosition | null): position is EffectivePosition {
  if (!position) return false;
  if (position.source !== "gps") return true;
  return position.accuracyM != null && position.accuracyM <= GPS_MAX_ACCURACY_M;
}

/** Metros al tramo más cercano de `keys`. */
export function distanceToSegmentsM(point: LatLng, keys: Iterable<SegmentKey>): number {
  let best = Infinity;
  for (const key of keys) best = Math.min(best, distanceToSegmentM(point, key));
  return best;
}

export function isOnSite(position: EffectivePosition | null, keys: Iterable<SegmentKey>): boolean {
  if (!positionIsTrusted(position)) return false;
  return distanceToSegmentsM(position.point, keys) <= ON_SITE_RADIUS_M;
}

/** Valor que guarda el servidor en `position_source`. */
export function serverPositionSource(position: EffectivePosition | null): "simulated" | "gps" {
  return position && !position.isSimulated ? "gps" : "simulated";
}
