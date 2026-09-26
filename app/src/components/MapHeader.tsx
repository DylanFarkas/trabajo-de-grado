import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import type { CampusPlace, PresetRoute } from "@/places";
import type { RouteSlot } from "@/components/RouteSheet";

type MapHeaderProps = {
  topInset: number;
  status?: string;
  query: string;
  onQueryChange: (value: string) => void;
  results: CampusPlace[];
  onSelectResult: (place: CampusPlace) => void;
  activeSlot: RouteSlot;
  view3d: boolean;
  onToggleView: () => void;
  locating?: boolean;
  onLocate?: () => void;
  onOpenAssistant?: () => void;
  assistantActive?: boolean;
  presetRoutes?: PresetRoute[];
  onSelectPreset?: (route: PresetRoute) => void;
};

export function MapHeader({
  topInset,
  status,
  query,
  onQueryChange,
  results,
  onSelectResult,
  activeSlot,
  view3d,
  onToggleView,
  locating = false,
  onLocate,
  onOpenAssistant,
  assistantActive = false,
  presetRoutes = [],
  onSelectPreset,
}: MapHeaderProps) {
  const loading = Boolean(status);
  const showResults = query.trim().length > 0;
  const slotLabel = activeSlot === "origin" ? "origen" : "destino";

  return (
    <View className="absolute left-4 right-4 z-40" style={{ top: topInset + 8 }}>
      <View className="flex-row items-center">
        <View
          className="mr-2 size-12 items-center justify-center rounded-full bg-[#111111] shadow-lg"
          accessibilityLabel="Universidad del Valle"
        >
          <Text className="text-[13px] font-extrabold tracking-wide text-white">UV</Text>
        </View>

        <View className="mr-2 h-12 min-w-0 flex-1 flex-row items-center overflow-hidden rounded-full bg-white pl-3.5 pr-2 shadow-lg">
          <View className="mr-2 size-3.5 rounded-full border-2 border-[#8e8e93]">
            <View className="absolute -bottom-px -right-1.25 h-0.5 w-1.5 rotate-45 rounded-sm bg-[#8e8e93]" />
          </View>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder={activeSlot === "origin" ? "Buscar origen" : "Buscar destino"}
            placeholderTextColor="#8e8e93"
            className="h-12 min-w-0 flex-1 text-base text-[#111111]"
            style={{ paddingVertical: 0, paddingHorizontal: 0, margin: 0, includeFontPadding: false }}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            underlineColorAndroid="transparent"
            accessibilityLabel={activeSlot === "origin" ? "Buscar origen" : "Buscar destino"}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Borrar búsqueda"
              hitSlop={8}
              onPress={() => onQueryChange("")}
              className="active:opacity-80"
            >
              <View className="size-7 items-center justify-center rounded-full bg-[#f2f2f4]">
                <Text className="text-[11px] font-bold text-[#6b6b70]">✕</Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {onOpenAssistant ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir asistente de rutas"
            onPress={onOpenAssistant}
            className="mr-2 active:opacity-80"
          >
            <View
              className={`size-10.5 shrink-0 items-center justify-center rounded-full shadow-md ${
                assistantActive ? "bg-[#111111]" : "bg-white"
              }`}
            >
              <MaterialIcons
                name="auto-awesome"
                size={20}
                color={assistantActive ? "#ffffff" : "#111111"}
              />
            </View>
          </Pressable>
        ) : null}

        {onLocate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Detectar mi ubicación"
            disabled={locating}
            onPress={onLocate}
            className="mr-2 active:opacity-80"
          >
            <View
              className={`size-10.5 shrink-0 items-center justify-center rounded-full shadow-md ${
                locating ? "bg-[#111111]" : "bg-white"
              }`}
            >
              {locating ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View className="size-4.5 items-center justify-center">
                  <View className="absolute size-4 rounded-full border-2 border-[#111111]" />
                  <View className="size-1.5 rounded-full bg-[#111111]" />
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
            className={`size-10.5 shrink-0 items-center justify-center rounded-full shadow-md ${
              view3d ? "bg-[#111111]" : "bg-white"
            }`}
          >
            <Text
              className={`text-[13px] font-extrabold tracking-wide ${
                view3d ? "text-white" : "text-[#111111]"
              }`}
            >
              {view3d ? "3D" : "2D"}
            </Text>
          </View>
        </Pressable>
      </View>

      {!showResults && onSelectPreset ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2"
          contentContainerClassName="gap-2"
        >
          {presetRoutes.length === 0 ? (
            <View className="rounded-full bg-white px-4 py-2 shadow-md">
              <Text className="text-sm font-semibold text-[#8e8e93]">Sin rutas publicadas</Text>
            </View>
          ) : (
            presetRoutes.map((route) => (
              <Pressable
                key={route.id}
                accessibilityRole="button"
                accessibilityLabel={`Recorrer ${route.name}`}
                onPress={() => onSelectPreset(route)}
                className="active:opacity-80"
              >
                <View className="rounded-full bg-white px-4 py-2 shadow-md">
                  <Text className="text-sm font-semibold text-[#111111]">{route.name}</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : null}

      {loading && !showResults ? (
        <View className="mt-2 flex-row items-center self-center rounded-full bg-white/95 px-3 py-2 shadow-[0_6px_16px_rgba(17,17,17,0.1)]">
          <ActivityIndicator size="small" color="#111111" />
          <Text className="ml-2 text-[13px] font-semibold text-[#111111]">{status}</Text>
        </View>
      ) : null}

      {showResults ? (
        <View className="mt-2 overflow-hidden rounded-[22px] bg-white pb-2 shadow-[0_16px_36px_rgba(17,17,17,0.16)]">
          <Text className="px-4.5 pb-2.5 pt-4 text-sm font-medium text-[#8e8e93]">
            Toca un lugar para usarlo como {slotLabel}
          </Text>
          {results.length === 0 ? (
            <Text className="px-4.5 pb-3 text-[15px] text-[#3a3a3c]">
              No hay edificios con ese nombre
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" className="max-h-70">
              {results.map((place) => (
                <Pressable
                  key={place.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${place.title}. Usar como ${slotLabel}`}
                  onPress={() => onSelectResult(place)}
                  className="px-3.5 py-1"
                >
                  {({ pressed }) => (
                    <View
                      className={`w-full flex-row items-center rounded-[14px] px-2.5 py-2.5 ${
                        pressed ? "bg-[#f5f5f7]" : ""
                      }`}
                    >
                      <View className="mr-3 size-11 items-center justify-center rounded-xl bg-[#f3f3f5]">
                        <Text className="text-xs font-extrabold text-[#111111]" numberOfLines={1}>
                          {place.code ?? place.title.slice(0, 1)}
                        </Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-base font-semibold text-[#111111]" numberOfLines={1}>
                          {place.title}
                        </Text>
                        <Text className="mt-0.75 text-[13px] text-[#8e8e93]" numberOfLines={1}>
                          {place.categories[0] ?? "Campus"}
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}
