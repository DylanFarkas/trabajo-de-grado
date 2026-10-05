import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";

import { Icon } from "@/components/Icon";
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

const LIST_THUMB = 72;
const DETAIL_THUMB = 112;

function RouteThumb({
  uri,
  size,
  active = false,
}: {
  uri: string | null;
  size: number;
  active?: boolean;
}) {
  if (uri) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        contentFit="contain"
        source={{ uri }}
        style={{ width: size, height: size }}
        transition={150}
      />
    );
  }

  return (
    <View
      className={`items-center justify-center rounded-2xl ${
        active ? "bg-white/15 dark:bg-[#0b0f16]/10" : "bg-white dark:bg-[#232c3a]"
      }`}
      style={{ width: size, height: size }}
    >
      <Icon
        name="route"
        size={Math.round(size * 0.35)}
        colorClassName={
          active ? "accent-white dark:accent-[#0b0f16]" : "accent-[#8e8e93] dark:accent-[#8b95a5]"
        }
      />
    </View>
  );
}

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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = routes.find((route) => route.id === selectedId) ?? null;
  const selectedActive = selected != null && activeName === selected.name;

  useEffect(() => {
    if (visible) setSelectedId(null);
  }, [visible]);

  return (
    <SnapSheet
      bottomOffset={bottomOffset}
      maxHeight={maxHeight}
      onHeight={onHeight}
      visible={visible}
      onExited={onExited}
      header={({ expanded, toggle }) =>
        selected ? (
          <View className="flex-row items-start">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver a recorridos"
              onPress={() => setSelectedId(null)}
              hitSlop={8}
              className="mr-2 size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#1f2632]"
            >
              <Icon name="arrow-back" size={18} colorClassName="accent-[#111111] dark:accent-[#f2f4f7]" />
            </Pressable>
            <Pressable accessible={false} onPress={toggle} className="mr-2 min-w-0 flex-1 active:opacity-70">
              <Text className="text-lg font-bold leading-6 tracking-tight text-[#111111] dark:text-[#f2f4f7]" numberOfLines={2}>
                {selected.name}
              </Text>
              <Text className="mt-0.5 mb-3 font-sans text-sm text-[#8e8e93] dark:text-[#8b95a5]">
                {selected.stops.length} {selected.stops.length === 1 ? "parada" : "paradas"}
                {selectedActive ? " · En curso" : ""}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Minimizar recorrido" : "Mostrar recorrido"}
              onPress={toggle}
              hitSlop={6}
              className="size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#1f2632]"
            >
              <Icon
                name={expanded ? "expand-more" : "expand-less"}
                size={20}
                colorClassName="accent-[#3a3a3c] dark:accent-[#c5ccd6]"
              />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-start">
            <Pressable accessible={false} onPress={toggle} className="min-w-0 flex-1 active:opacity-70">
              <Text className="text-[22px] font-extrabold tracking-tight text-[#111111] dark:text-[#f2f4f7]">
                Recorridos
              </Text>
              <Text className="mt-1 mb-3 font-sans text-sm text-[#8e8e93] dark:text-[#8b95a5]">
                Rutas preparadas por la universidad
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Minimizar recorridos" : "Mostrar recorridos"}
              onPress={toggle}
              hitSlop={6}
              className="ml-2 size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#1f2632]"
            >
              <Icon
                name={expanded ? "expand-more" : "expand-less"}
                size={20}
                colorClassName="accent-[#3a3a3c] dark:accent-[#c5ccd6]"
              />
            </Pressable>
          </View>
        )
      }
    >
      {selected ? (
        <View>
          <View className="items-center">
            <RouteThumb uri={selected.imageUrl} size={DETAIL_THUMB} />
          </View>
          {selected.description ? (
            <Text className="mt-4 font-sans text-[15px] leading-6 text-[#3a3a3c] dark:text-[#c5ccd6]">
              {selected.description}
            </Text>
          ) : null}

          <Text className="mt-5 mb-3 text-[13px] font-bold uppercase tracking-wide text-[#8e8e93] dark:text-[#8b95a5]">
            Lugares del recorrido
          </Text>
          {selected.stops.map((code, index) => {
            const last = index === selected.stops.length - 1;
            return (
              <View key={`${code}-${index}`} className="flex-row">
                <View className="mr-3 items-center">
                  <View
                    className={`size-7 items-center justify-center rounded-full ${
                      last ? "bg-[#1d4ed8] dark:bg-[#3b82f6]" : "bg-[#111111] dark:bg-[#f2f4f7]"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold text-white ${last ? "" : "dark:text-[#0b0f16]"}`}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  {!last ? <View className="w-0.5 flex-1 bg-[#e0e0e5] dark:bg-[#2c3441]" /> : null}
                </View>
                <Text
                  className="min-w-0 flex-1 pb-4 pt-1 text-[15px] font-semibold text-[#111111] dark:text-[#f2f4f7]"
                  numberOfLines={2}
                >
                  {stopName(code)}
                </Text>
              </View>
            );
          })}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={selectedActive ? `Continuar recorrido ${selected.name}` : `Iniciar recorrido ${selected.name}`}
            onPress={() => onStart(selected)}
            className={`mt-2 h-12 flex-row items-center justify-center rounded-2xl active:opacity-80 ${
              selectedActive ? "bg-[#f2f2f4] dark:bg-[#1f2632]" : "bg-[#111111] dark:bg-[#f2f4f7]"
            }`}
          >
            <Icon
              name={selectedActive ? "near-me" : "play-arrow"}
              size={20}
              colorClassName={
                selectedActive
                  ? "accent-[#111111] dark:accent-[#f2f4f7]"
                  : "accent-white dark:accent-[#0b0f16]"
              }
            />
            <Text
              className={`ml-1 text-[15px] font-bold ${
                selectedActive ? "text-[#111111] dark:text-[#f2f4f7]" : "text-white dark:text-[#0b0f16]"
              }`}
            >
              {selectedActive ? "En curso" : "Iniciar"}
            </Text>
          </Pressable>
        </View>
      ) : loading && routes.length === 0 ? (
        <View className="items-center py-8">
          <ActivityIndicator size="small" colorClassName="accent-[#111111] dark:accent-[#f2f4f7]" />
          <Text className="mt-2 font-sans text-sm text-[#8e8e93] dark:text-[#8b95a5]">Cargando recorridos…</Text>
        </View>
      ) : routes.length === 0 ? (
        <View className="items-center py-8">
          <View className="size-12 items-center justify-center rounded-2xl bg-[#f2f2f4] dark:bg-[#1f2632]">
            <Icon name="route" size={24} colorClassName="accent-[#8e8e93] dark:accent-[#8b95a5]" />
          </View>
          <Text className="mt-3 text-[15px] font-bold text-[#111111] dark:text-[#f2f4f7]">Aún no hay recorridos</Text>
          <Text className="mt-1 text-center font-sans text-[13px] leading-5 text-[#8e8e93] dark:text-[#8b95a5]">
            Cuando la universidad publique uno, aparecerá aquí.
          </Text>
        </View>
      ) : (
        <View>
          {routes.map((route) => {
            const active = activeName === route.name;
            return (
              <Pressable
                key={route.id}
                accessibilityRole="button"
                accessibilityLabel={`Ver recorrido ${route.name}`}
                onPress={() => setSelectedId(route.id)}
                className={`mb-3 flex-row items-center rounded-[20px] p-3 active:opacity-80 ${
                  active ? "bg-[#111111] dark:bg-[#f2f4f7]" : "bg-[#f7f7f8] dark:bg-[#18202a]"
                }`}
              >
                <View className="mr-3 min-w-0 flex-1">
                  <Text
                    className={`text-base font-bold ${
                      active ? "text-white dark:text-[#0b0f16]" : "text-[#111111] dark:text-[#f2f4f7]"
                    }`}
                    numberOfLines={2}
                  >
                    {route.name}
                  </Text>
                  {active ? (
                    <Text className="mt-1 text-xs font-semibold text-white/70 dark:text-[#0b0f16]/60">
                      En curso
                    </Text>
                  ) : null}
                </View>
                <RouteThumb uri={route.imageUrl} size={LIST_THUMB} active={active} />
              </Pressable>
            );
          })}
        </View>
      )}
    </SnapSheet>
  );
}
