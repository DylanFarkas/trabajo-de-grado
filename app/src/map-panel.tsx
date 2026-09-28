import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type MapPanel = "map" | "tours" | "assistant";

type MapPanelContextValue = {
  panel: MapPanel;
  setPanel: (panel: MapPanel) => void;
  selectMapTab: (panel: MapPanel) => void;
  registerSelectMapTab: (handler: (panel: MapPanel) => void) => () => void;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
};

const MapPanelContext = createContext<MapPanelContextValue | null>(null);

export function MapPanelProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<MapPanel>("map");
  const [profileOpen, setProfileOpen] = useState(false);
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

  const value = useMemo(
    () => ({ panel, setPanel, selectMapTab, registerSelectMapTab, profileOpen, setProfileOpen }),
    [panel, selectMapTab, registerSelectMapTab, profileOpen],
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
