import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Uniwind } from "uniwind";

import { CALI_NIGHT, type MapTheme, type MapThemeMode } from "@/constants/mapTheme";

const STORAGE_KEY = "map-theme-v1";
const MODES: readonly MapThemeMode[] = ["auto", "day", "night"];

export function isCaliNight(now: Date = new Date()): boolean {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const minutes = (utcMinutes + CALI_NIGHT.utcOffsetMinutes + 24 * 60) % (24 * 60);
  return minutes >= CALI_NIGHT.startMinutes || minutes < CALI_NIGHT.endMinutes;
}

function resolveTheme(mode: MapThemeMode): MapTheme {
  if (mode === "auto") return isCaliNight() ? "night" : "day";
  return mode;
}

/**
 * Tema del mapa, independiente del tema del teléfono. `theme` es `null` hasta
 * leer la preferencia guardada, para no pintar el mapa de día y luego saltar a noche.
 * `initialTheme` no cambia después: es con el que arranca el WebView.
 */
export function useMapTheme() {
  const [mode, setModeState] = useState<MapThemeMode | null>(null);
  const [theme, setTheme] = useState<MapTheme | null>(null);
  const [initialTheme, setInitialTheme] = useState<MapTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let saved: MapThemeMode = "auto";
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && (MODES as readonly string[]).includes(raw)) saved = raw as MapThemeMode;
      } catch {
        // Sin almacenamiento se usa el modo automático.
      }
      if (cancelled) return;
      const resolved = resolveTheme(saved);
      setModeState(saved);
      setTheme(resolved);
      setInitialTheme(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "auto") return;
    const timer = setInterval(() => {
      setTheme(resolveTheme("auto"));
    }, 60_000);
    return () => clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    Uniwind.setTheme(theme === "night" ? "dark" : "light");
  }, [theme]);

  const setMode = useCallback((next: MapThemeMode) => {
    setModeState(next);
    setTheme(resolveTheme(next));
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  return { mode, theme, initialTheme, setMode };
}
