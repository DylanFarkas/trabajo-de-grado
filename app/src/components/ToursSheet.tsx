import { ActivityIndicator, Pressable, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { SnapSheet } from "@/components/SnapSheet";
import type { PresetRoute } from "@/places";

type ToursSheetProps = {
  bottomOffset: number;
  maxHeight: number;
  onHeight?: (height: number) => void;
  visible?: boolean;
  onExited?: () => void;
  routes: PresetRoute[];
  loading: boolean;
  activeName: string | null;
  stopName: (code: string) => string;
  onStart: (route: PresetRoute) => void;
};

const PREVIEW_STOPS = 3;

export function ToursSheet({
  bottomOffset,
  maxHeight,
  onHeight,
  visible,
  onExited,
  routes,
  loading,
  activeName,
  stopName,
  onStart,
}: ToursSheetProps) {
  return (
    <SnapSheet
      bottomOffset={bottomOffset}
      maxHeight={maxHeight}
      onHeight={onHeight}
      visible={visible}
      onExited={onExited}
      header={({ expanded, toggle }) => (
        <View className="flex-row items-start">
          <Pressable accessible={false} onPress={toggle} className="min-w-0 flex-1 active:opacity-70">
            <Text className="text-[22px] font-extrabold tracking-tight text-[#111111]">
              Recorridos
            </Text>
            <Text className="mt-1 mb-3 font-sans text-sm text-[#8e8e93]">Rutas preparadas por la universidad</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Minimizar recorridos" : "Mostrar recorridos"}
            onPress={toggle}
            hitSlop={6}
            className="ml-2 size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
          >
            <MaterialIcons name={expanded ? "expand-more" : "expand-less"} size={20} color="#3a3a3c" />
          </Pressable>
        </View>
      )}
    >
      {loading && routes.length === 0 ? (
        <View className="items-center py-8">
          <ActivityIndicator size="small" color="#111111" />
          <Text className="mt-2 font-sans text-sm text-[#8e8e93]">Cargando recorridos…</Text>
        </View>
      ) : routes.length === 0 ? (
        <View className="items-center py-8">
          <View className="size-12 items-center justify-center rounded-2xl bg-[#f2f2f4]">
            <MaterialIcons name="route" size={24} color="#8e8e93" />
          </View>
          <Text className="mt-3 text-[15px] font-bold text-[#111111]">Aún no hay recorridos</Text>
          <Text className="mt-1 text-center font-sans text-[13px] leading-5 text-[#8e8e93]">
            Cuando la universidad publique uno, aparecerá aquí.
          </Text>
        </View>
      ) : (
        <View>
          {routes.map((route) => {
            const active = activeName === route.name;
            const names = route.stops.map(stopName);
            const preview = names.slice(0, PREVIEW_STOPS);
            const extra = names.length - preview.length;
            return (
              <Pressable
                key={route.id}
                accessibilityRole="button"
                accessibilityLabel={`Iniciar recorrido ${route.name}, ${route.stops.length} paradas`}
                onPress={() => onStart(route)}
                className={`mb-3 rounded-[20px] p-4 active:opacity-80 ${
                  active ? "bg-[#111111]" : "bg-[#f7f7f8]"
                }`}
              >
                <View className="flex-row items-start">
                  <View className="mr-3 min-w-0 flex-1">
                    <Text
                      className={`text-base font-bold ${active ? "text-white" : "text-[#111111]"}`}
                      numberOfLines={1}
                    >
                      {route.name}
                    </Text>
                    {route.description ? (
                      <Text
                        className={`mt-1 font-sans text-[13px] leading-5 ${
                          active ? "text-white/70" : "text-[#6b6b70]"
                        }`}
                        numberOfLines={2}
                      >
                        {route.description}
                      </Text>
                    ) : null}
                  </View>
                  <View className={`rounded-full px-3 py-1 ${active ? "bg-white/15" : "bg-white"}`}>
                    <Text className={`text-xs font-bold ${active ? "text-white" : "text-[#111111]"}`}>
                      {route.stops.length} paradas
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row items-center">
                  <Text
                    className={`min-w-0 flex-1 text-[13px] font-semibold ${
                      active ? "text-white/80" : "text-[#3a3a3c]"
                    }`}
                    numberOfLines={1}
                  >
                    {preview.join("  ›  ")}
                    {extra > 0 ? `  +${extra}` : ""}
                  </Text>
                  <View
                    className={`ml-3 h-8 flex-row items-center rounded-full px-3 ${
                      active ? "bg-white" : "bg-[#111111]"
                    }`}
                  >
                    <Text className={`text-[13px] font-bold ${active ? "text-[#111111]" : "text-white"}`}>
                      {active ? "En curso" : "Iniciar"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </SnapSheet>
  );
}
