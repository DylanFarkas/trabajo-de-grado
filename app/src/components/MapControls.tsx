import { ActivityIndicator, Pressable, Text, View } from "react-native";

export const MAP_CONTROLS_WIDTH = 120;

type MapControlsProps = {
  top: number;
  view3d: boolean;
  onToggleView: () => void;
  locating?: boolean;
  onLocate?: () => void;
};

export function MapControls({
  top,
  view3d,
  onToggleView,
  locating = false,
  onLocate,
}: MapControlsProps) {
  return (
    <View
      className="absolute right-4 z-20 flex-row items-center"
      style={{ top }}
      pointerEvents="box-none"
    >
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
              locating ? "bg-[#111111]" : "bg-white"
            }`}
          >
            {locating ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View className="size-5 items-center justify-center">
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
          className={`size-11 items-center justify-center rounded-full shadow-md ${
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
  );
}
