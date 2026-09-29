import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CatalogTone } from "@/places";

export type MapPanel = "map" | "tours" | "assistant";

export type PlaceDetailsTarget = {
  code: string;
  title: string;
  subtitle: string | null;
  categories: string[];
  description: string | null;
  tone: CatalogTone | null;
};

type MapPanelContextValue = {
  panel: MapPanel;
  setPanel: (panel: MapPanel) => void;
  selectMapTab: (panel: MapPanel) => void;
  registerSelectMapTab: (handler: (panel: MapPanel) => void) => () => void;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  placeDetails: PlaceDetailsTarget | null;
  openPlaceDetails: (target: PlaceDetailsTarget) => void;
  closePlaceDetails: () => void;
};

const MapPanelContext = createContext<MapPanelContextValue | null>(null);

export function MapPanelProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<MapPanel>("map");
  const [profileOpen, setProfileOpen] = useState(false);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetailsTarget | null>(null);
  const handlerRef = useRef<(next: MapPanel) => void>((next) => setPanel(next));

  const registerSelectMapTab = useCallback((handler: (panel: MapPanel) => void) => {
    handlerRef.current = handler;
    return () => {
      handlerRef.current = (next) => setPanel(next);
    };
  }, []);

  const selectMapTab = useCallback((next: MapPanel) => {
    handlerRef.current(next);
  }, []);

  const openPlaceDetails = useCallback((target: PlaceDetailsTarget) => {
    setPlaceDetails(target);
  }, []);

  const closePlaceDetails = useCallback(() => {
    setPlaceDetails(null);
  }, []);

  const value = useMemo(
    () => ({
      panel,
      setPanel,
      selectMapTab,
      registerSelectMapTab,
      profileOpen,
      setProfileOpen,
      placeDetails,
      openPlaceDetails,
      closePlaceDetails,
    }),
    [panel, selectMapTab, registerSelectMapTab, profileOpen, placeDetails, openPlaceDetails, closePlaceDetails],
  );

  return <MapPanelContext.Provider value={value}>{children}</MapPanelContext.Provider>;
}

export function useMapPanel() {
  const ctx = useContext(MapPanelContext);
  if (!ctx) {
    throw new Error("useMapPanel debe usarse dentro de MapPanelProvider");
  }
  return ctx;
}
