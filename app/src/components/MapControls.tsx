import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import type { MapTheme, MapThemeMode } from "@/constants/mapTheme";

export const MAP_CONTROLS_WIDTH = 120;

const THEME_OPTIONS: {
  id: MapThemeMode;
  label: string;
  icon: "brightness-auto" | "light-mode" | "dark-mode";
}[] = [
  { id: "auto", label: "Automático", icon: "brightness-auto" },
  { id: "day", label: "Día", icon: "light-mode" },
  { id: "night", label: "Noche", icon: "dark-mode" },
];

type MapControlsProps = {
  top: number;
  view3d: boolean;
  onToggleView: () => void;
  locating?: boolean;
  onLocate?: () => void;
  themeMode?: MapThemeMode | null;
  theme?: MapTheme | null;
  themeBusy?: boolean;
  themeMenuOpen?: boolean;
  onThemeMenuOpenChange?: (open: boolean) => void;
  onThemeModeChange?: (mode: MapThemeMode) => void;
};

export function MapControls({
  top,
  view3d,
  onToggleView,
  locating = false,
  onLocate,
  themeMode = null,
  theme = null,
  themeBusy = false,
  themeMenuOpen = false,
  onThemeMenuOpenChange,
  onThemeModeChange,
}: MapControlsProps) {
  const night = theme === "night";
  const showTheme = Boolean(themeMode && onThemeModeChange);

  return (
    <View className="absolute right-4 z-20 items-end" style={{ top }} pointerEvents="box-none">
      <View className="flex-row items-center" pointerEvents="box-none">
        {onLocate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Detectar mi ubicación"
            disabled={locating}
            onPress={onLocate}
            className="mr-2 active:opacity-80"
          >
            <View
              className={`size-11 items-center justify-center rounded-full shadow-md ${
                locating ? "bg-[#111111] dark:bg-[#f2f4f7]" : "bg-white dark:bg-[#161d27]"
              }`}
            >
              {locating ? (
                <ActivityIndicator
                  size="small"
                  colorClassName="accent-white dark:accent-[#0b0f16]"
                />
              ) : (
                <View className="size-5 items-center justify-center">
                  <View className="absolute size-4 rounded-full border-2 border-[#111111] dark:border-[#f2f4f7]" />
                  <View className="size-1.5 rounded-full bg-[#111111] dark:bg-[#f2f4f7]" />
                </View>
              )}
            </View>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view3d ? "Cambiar a vista 2D" : "Cambiar a vista 3D"}
          onPress={onToggleView}
          className="active:opacity-80"
        >
          <View
            className={`size-11 items-center justify-center rounded-full shadow-md ${
              view3d ? "bg-[#111111] dark:bg-[#f2f4f7]" : "bg-white dark:bg-[#161d27]"
            }`}
          >
            <Text
              className={`text-[13px] font-extrabold tracking-wide ${
                view3d ? "text-white dark:text-[#0b0f16]" : "text-[#111111] dark:text-[#f2f4f7]"
              }`}
            >
              {view3d ? "3D" : "2D"}
            </Text>
          </View>
        </Pressable>
      </View>

      {showTheme ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tema del mapa: ${
            THEME_OPTIONS.find((option) => option.id === themeMode)?.label ?? ""
          }${themeMode === "auto" ? (night ? ", ahora noche" : ", ahora día") : ""}`}
          accessibilityState={{ expanded: themeMenuOpen, busy: themeBusy }}
          disabled={themeBusy}
          onPress={() => onThemeMenuOpenChange?.(!themeMenuOpen)}
          className="mt-2 active:opacity-80"
        >
          <View
            className={`size-11 items-center justify-center rounded-full bg-white shadow-md dark:bg-[#161d27] ${
              themeMenuOpen ? "border-2 border-[#111111] dark:border-[#f2f4f7]" : ""
            }`}
          >
            {themeBusy ? (
              <ActivityIndicator
                size="small"
                colorClassName="accent-[#111111] dark:accent-[#f2f4f7]"
              />
            ) : (
              <Icon
                name={night ? "dark-mode" : "light-mode"}
                size={21}
                colorClassName="accent-[#111111] dark:accent-[#f5d58a]"
              />
            )}
            {themeMode === "auto" && !themeBusy ? (
              <View className="absolute -bottom-0.5 -right-0.5 size-4.5 items-center justify-center rounded-full border-2 border-white bg-[#111111] dark:border-[#161d27] dark:bg-[#f2f4f7]">
                <Text className="text-[8px] font-extrabold text-white dark:text-[#0b0f16]">A</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      {showTheme && themeMenuOpen ? (
        <View
          className="mt-2 w-48 overflow-hidden rounded-[20px] bg-white p-1.5 shadow-[0_12px_28px_rgba(17,17,17,0.18)] dark:bg-[#141b25] dark:shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
          accessibilityRole="menu"
        >
          {THEME_OPTIONS.map((option) => {
            const on = themeMode === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: on }}
                accessibilityLabel={option.label}
                onPress={() => {
                  onThemeMenuOpenChange?.(false);
                  if (!on) onThemeModeChange?.(option.id);
                }}
                className={`h-11 flex-row items-center rounded-2xl px-3 active:opacity-70 ${
                  on ? "bg-[#f2f2f4] dark:bg-[#212a37]" : ""
                }`}
              >
                <Icon
                  name={option.icon}
                  size={18}
                  colorClassName="accent-[#3a3a3c] dark:accent-[#c5ccd6]"
                />
                <Text className="ml-2.5 flex-1 text-[15px] font-semibold text-[#111111] dark:text-[#f2f4f7]">
                  {option.label}
                </Text>
                {on ? (
                  <Icon
                    name="check"
                    size={18}
                    colorClassName="accent-[#111111] dark:accent-[#f2f4f7]"
                  />
                ) : null}
              </Pressable>
            );
          })}
          <Text className="px-3 pb-1.5 pt-1 font-sans text-[11px] leading-4 text-[#8e8e93] dark:text-[#8b95a5]">
            Automático: noche de 6:15 p. m. a 5:45 a. m.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
