import { Pressable, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import type { RouteSlot } from "@/components/RouteSheet";
import { SnapSheet } from "@/components/SnapSheet";

export type PlacePreview = {
  title: string;
  subtitle: string | null;
  code: string | null;
  categories: string[];
  detail: string | null;
};

type ExploreSheetProps = {
  bottomOffset: number;
  maxHeight: number;
  place: PlacePreview;
  onClosePlace: () => void;
  onUsePlace: (slot: RouteSlot) => void;
  onHeight?: (height: number) => void;
  visible?: boolean;
  onExited?: () => void;
};

export function ExploreSheet({
  bottomOffset,
  maxHeight,
  place,
  onClosePlace,
  onUsePlace,
  onHeight,
  visible,
  onExited,
}: ExploreSheetProps) {
  return (
    <SnapSheet
      bottomOffset={bottomOffset}
      maxHeight={maxHeight}
      onHeight={onHeight}
      visible={visible}
      onExited={onExited}
      header={({ expanded, toggle }) => (
        <View className="flex-row items-start">
          <Pressable
            accessible={false}
            onPress={toggle}
            className="mr-3 size-12 items-center justify-center rounded-2xl bg-[#111111] active:opacity-80"
          >
            <Text className="text-[11px] font-extrabold text-white" numberOfLines={1}>
              {(place.code || place.title).slice(0, 3)}
            </Text>
          </Pressable>
          <Pressable accessible={false} onPress={toggle} className="mr-2 min-w-0 flex-1 active:opacity-70">
            <Text className="text-lg font-bold leading-6 tracking-tight text-[#111111]" numberOfLines={2}>
              {place.title}
            </Text>
            <Text className="mt-0.5 font-sans text-[13px] text-[#8e8e93]" numberOfLines={1}>
              {[place.subtitle, place.categories.join(" · ")].filter(Boolean).join(" · ") || "Campus"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Minimizar lugar" : "Mostrar lugar"}
            onPress={toggle}
            hitSlop={6}
            className="mr-2 size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
          >
            <MaterialIcons name={expanded ? "expand-more" : "expand-less"} size={20} color="#3a3a3c" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={onClosePlace}
            hitSlop={8}
            className="size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
          >
            <MaterialIcons name="close" size={18} color="#3a3a3c" />
          </Pressable>
        </View>
      )}
    >
      {place.detail ? <Text className="font-sans text-[13px] text-[#8e8e93]">{place.detail}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cómo llegar a ${place.title}`}
        onPress={() => onUsePlace("destination")}
        className="mt-4 h-12 flex-row items-center justify-center rounded-2xl bg-[#111111] active:opacity-80"
      >
        <MaterialIcons name="near-me" size={18} color="#ffffff" />
        <Text className="ml-2 text-[15px] font-bold text-white">Cómo llegar</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Salir desde ${place.title}`}
        onPress={() => onUsePlace("origin")}
        className="mt-1 h-11 items-center justify-center active:opacity-60"
      >
        <Text className="text-sm font-semibold text-[#3a3a3c]">Salir desde aquí</Text>
      </Pressable>
    </SnapSheet>
  );
}
