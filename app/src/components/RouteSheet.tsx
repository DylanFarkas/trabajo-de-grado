import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { withUniwind } from "uniwind";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import type { CampusEntrance } from "@/constants/entrances";
import type { StreetProfile } from "@/routing/openRouteService";

const AnimatedView = withUniwind(Animated.View);

export type RouteSlot = "origin" | "destination";

export type PlacePreview = {
  title: string;
  subtitle: string | null;
  code: string | null;
  categories: string[];
  detail: string | null;
};

type RouteSheetProps = {
  bottomInset: number;
  activeSlot: RouteSlot;
  onSelectSlot: (slot: RouteSlot) => void;
  originName: string | null;
  destinationName: string | null;
  onClearSlot: (slot: RouteSlot) => void;
  onSwap: () => void;
  onClearAll: () => void;
  distanceLabel: string | null;
  durationLabel: string | null;
  routeMeta: string | null;
  error: string | null;
  place: PlacePreview | null;
  onClosePlace: () => void;
  onUsePlace: (slot: RouteSlot) => void;
  showGoToCampus?: boolean;
  campusPickerOpen?: boolean;
  entrances?: CampusEntrance[];
  relocatingEntranceId?: string | null;
  onOpenCampusPicker?: () => void;
  onCloseCampusPicker?: () => void;
  onSelectEntrance?: (entrance: CampusEntrance) => void;
  onRelocateEntrance?: (entranceId: string) => void;
  routing?: boolean;
  streetProfile?: StreetProfile;
  onStreetProfileChange?: (profile: StreetProfile) => void;
  presetName?: string | null;
  presetStops?: { letter: string; name: string }[] | null;
};

const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };
const DEFAULT_HIDDEN = 320;

function WalkIcon({ on }: { on: boolean }) {
  return (
    <MaterialIcons
      name="directions-walk"
      size={20}
      color={on ? "#ffffff" : "#3a3a3c"}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function CarIcon({ on }: { on: boolean }) {
  return (
    <MaterialIcons
      name="directions-car"
      size={20}
      color={on ? "#ffffff" : "#3a3a3c"}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function ModeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: StreetProfile;
  onChange?: (profile: StreetProfile) => void;
  disabled?: boolean;
}) {
  const walkOn = value === "foot-walking";
  const driveOn = value === "driving-car";

  return (
    <View className="mb-4.5">
      <Text className="mb-2.5 text-xs font-bold uppercase tracking-wide text-[#8e8e93]">
        Cómo vas a llegar
      </Text>
      <View
        className={`w-full flex-row items-stretch ${disabled ? "opacity-[0.55]" : ""}`}
        accessibilityRole="tablist"
      >
        <View className="w-[48%]">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: walkOn }}
            accessibilityLabel="Ir a pie"
            disabled={disabled}
            onPress={() => onChange?.("foot-walking")}
            className="active:opacity-80"
          >
            <View
              className={`min-h-13 flex-row items-center justify-center self-stretch rounded-[14px] px-3 py-3.5 ${
                walkOn ? "bg-[#111111]" : "bg-[#f2f2f4]"
              }`}
            >
              <WalkIcon on={walkOn} />
              <Text
                className={`ml-2 text-[15px] font-bold tracking-tight ${
                  walkOn ? "text-white" : "text-[#3a3a3c]"
                }`}
              >
                A pie
              </Text>
            </View>
          </Pressable>
        </View>

        <View className="w-[4%]" />

        <View className="w-[48%]">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: driveOn }}
            accessibilityLabel="Ir en carro"
            disabled={disabled}
            onPress={() => onChange?.("driving-car")}
            className="active:opacity-80"
          >
            <View
              className={`min-h-13 flex-row items-center justify-center self-stretch rounded-[14px] px-3 py-3.5 ${
                driveOn ? "bg-[#111111]" : "bg-[#f2f2f4]"
              }`}
            >
              <CarIcon on={driveOn} />
              <Text
                className={`ml-2 text-[15px] font-bold tracking-tight ${
                  driveOn ? "text-white" : "text-[#3a3a3c]"
                }`}
              >
                En carro
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function FieldCard({
  letter,
  label,
  value,
  active,
  filled,
  tone,
  onPress,
  onClear,
}: {
  letter: string;
  label: string;
  value: string | null;
  active: boolean;
  filled: boolean;
  tone: "ink" | "blue";
  onPress: () => void;
  onClear: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${value ?? "Sin elegir"}${active ? ". Seleccionado" : ""}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`rounded-2xl border-2 px-4 py-4 active:opacity-80 ${
        active
          ? "border-[#111111] bg-white shadow-[0_0_0_3px_rgba(17,17,17,0.08)]"
          : "border-transparent bg-[#f7f7f8] opacity-[0.55]"
      }`}
    >
      <View className="w-full flex-row items-center">
        <View
          className={`mr-3.5 size-8.5 items-center justify-center rounded-full ${
            active ? "scale-[1.06]" : ""
          } ${!active ? "bg-[#c7c7cc]" : tone === "blue" ? "bg-[#1d4ed8]" : "bg-[#111111]"}`}
        >
          <Text className="text-[13px] font-bold text-white">{letter}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text
              className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${
                active ? "text-[#111111]" : "text-[#8e8e93]"
              }`}
            >
              {label}
            </Text>
            {active ? (
              <View
                className={`shrink-0 rounded-full px-2.25 py-0.75 ${
                  tone === "blue" ? "bg-[#1d4ed8]" : "bg-[#111111]"
                }`}
              >
                <Text
                  className="text-[10px] font-bold text-white"
                  style={{ includeFontPadding: false }}
                >
                  Eligiendo
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            className={`mt-0.75 text-[15px] leading-5 ${
              !value
                ? active
                  ? "font-semibold text-[#111111]"
                  : "font-medium text-[#aeaeb2]"
                : !active
                  ? "font-semibold text-[#6b6b70]"
                  : "font-semibold text-[#111111]"
            }`}
            numberOfLines={2}
          >
            {value ?? (active ? "Toca el mapa o un edificio" : "Toca para elegir")}
          </Text>
        </View>
        {filled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${label.toLowerCase()}`}
            hitSlop={8}
            onPress={onClear}
            className="ml-2.5 size-7 items-center justify-center rounded-full bg-[#ececef] active:opacity-80"
          >
            <Text className="text-[10px] font-bold text-[#6b6b70]">✕</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

export function RouteSheet({
  bottomInset,
  activeSlot,
  onSelectSlot,
  originName,
  destinationName,
  onClearSlot,
  onSwap,
  onClearAll,
  distanceLabel,
  durationLabel,
  routeMeta,
  error,
  place,
  onClosePlace,
  onUsePlace,
  showGoToCampus = false,
  campusPickerOpen = false,
  entrances = [],
  relocatingEntranceId = null,
  onOpenCampusPicker,
  onCloseCampusPicker,
  onSelectEntrance,
  routing = false,
  streetProfile = "foot-walking",
  onStreetProfileChange,
  presetName = null,
  presetStops = null,
}: RouteSheetProps) {
  const canSwap = Boolean(originName || destinationName);
  const canClear = Boolean(originName || destinationName || distanceLabel || error);
  const pickingLabel = activeSlot === "origin" ? "origen" : "destino";

  const peekHeight = 96 + Math.max(bottomInset, 12);
  const translateY = useSharedValue(DEFAULT_HIDDEN);
  const startY = useSharedValue(DEFAULT_HIDDEN);
  const hiddenY = useSharedValue(DEFAULT_HIDDEN);

  const summary = campusPickerOpen
    ? relocatingEntranceId
      ? "Toca el mapa para colocar la entrada"
      : "Elige por cuál entrada llegar"
    : distanceLabel
      ? [presetName, distanceLabel, durationLabel, routeMeta].filter(Boolean).join(" · ")
      : presetName
        ? presetName
      : originName && destinationName
        ? `${originName} → ${destinationName}`
        : originName
          ? `Desde ${originName}`
          : destinationName
            ? `Hacia ${destinationName}`
            : "Origen y destino";

  useEffect(() => {
    if (place || campusPickerOpen || showGoToCampus || presetName) {
      translateY.value = 0;
    }
  }, [place, campusPickerOpen, showGoToCampus, presetName, translateY]);

  const toggleSheet = () => {
    "worklet";
    const shouldOpen = translateY.value > hiddenY.value * 0.25;
    translateY.value = withSpring(shouldOpen ? 0 : hiddenY.value, SPRING);
  };

  const tap = Gesture.Tap().onEnd((_event, success) => {
    if (success) {
      toggleSheet();
    }
  });

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onBegin(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const next = startY.value + event.translationY;
      translateY.value = Math.min(Math.max(next, 0), hiddenY.value);
    })
    .onEnd((event) => {
      const shouldOpen =
        event.velocityY < -500 ||
        (event.velocityY <= 500 && translateY.value < hiddenY.value * 0.45);
      translateY.value = withSpring(shouldOpen ? 0 : hiddenY.value, SPRING);
    });

  const headerGesture = Gesture.Exclusive(pan, tap);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <AnimatedView
      className="absolute bottom-0 left-0 right-0 z-20 rounded-t-[28px] bg-white px-5 pt-3 shadow-[0_-10px_30px_rgba(17,17,17,0.12)]"
      style={[{ paddingBottom: Math.max(bottomInset, 16) + 16 }, sheetStyle]}
      onLayout={(event) => {
        const nextHidden = Math.max(0, event.nativeEvent.layout.height - peekHeight);
        const wasCollapsed = translateY.value > hiddenY.value * 0.5;
        hiddenY.value = nextHidden;
        if (place) {
          translateY.value = 0;
        } else if (wasCollapsed) {
          translateY.value = nextHidden;
        }
      }}
    >
      <GestureDetector gesture={headerGesture}>
        <AnimatedView
          className="min-h-17 justify-center pb-4.5"
          accessibilityRole="button"
          accessibilityLabel="Abrir o cerrar tu ruta"
        >
          <View className="mb-3.5 h-1 w-9 self-center rounded-sm bg-[#e0e0e5]" />
          <View className="flex-row items-center">
            <View className="mr-2 min-w-0 flex-1">
              <Text className="text-lg font-bold tracking-tight text-[#111111]">Tu ruta</Text>
              <Text className="mt-1 text-[13px] leading-4.5 text-[#8e8e93]" numberOfLines={2}>
                {summary}
              </Text>
            </View>
          </View>
        </AnimatedView>
      </GestureDetector>

      <View className="pb-1 pt-2">
        {place ? (
          <View>
            <View className="mb-3.5 flex-row items-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver a la ruta"
                onPress={onClosePlace}
                hitSlop={8}
                className="mr-2 size-8 items-center justify-center rounded-full bg-[#f5f5f7] active:opacity-80"
              >
                <Text className="-mt-0.5 text-2xl leading-6.5 text-[#111111]">‹</Text>
              </Pressable>
              <Text className="text-[13px] font-bold text-[#8e8e93]">Para el {pickingLabel}</Text>
            </View>

            <View className="flex-row items-center">
              <View className="mr-3 min-w-0 flex-1">
                <Text
                  className="text-lg font-bold leading-5.75 tracking-tight text-[#111111]"
                  numberOfLines={2}
                >
                  {place.title}
                </Text>
                {place.subtitle ? (
                  <Text className="mt-1 text-[13px] text-[#8e8e93]" numberOfLines={1}>
                    {place.subtitle}
                  </Text>
                ) : null}
              </View>
              <View className="size-12 items-center justify-center rounded-full bg-[#111111]">
                <Text className="text-[11px] font-extrabold text-white">
                  {(place.code || place.title).slice(0, 3)}
                </Text>
              </View>
            </View>

            {place.categories.length > 0 ? (
              <View className="mt-3 flex-row flex-wrap">
                {place.categories.map((category) => (
                  <View key={category} className="mb-1.5 mr-1.5 rounded-full bg-[#f5f5f7] px-2.5 py-1.25">
                    <Text className="text-xs font-semibold text-[#3a3a3c]">{category}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {place.detail ? (
              <Text className="mt-2 text-[13px] text-[#8e8e93]">{place.detail}</Text>
            ) : null}

            <View className="mt-5 h-14 items-center justify-center self-stretch overflow-hidden rounded-2xl bg-[#111111]">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Elegir como ${pickingLabel}`}
                onPress={() => onUsePlace(activeSlot)}
                className="h-full w-full items-center justify-center px-5 active:bg-[#2c2c2e]"
              >
                <Text
                  className="text-center text-[17px] font-bold tracking-tight text-white"
                  style={{ includeFontPadding: false, textAlignVertical: "center" }}
                >
                  Elegir como {pickingLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : campusPickerOpen ? (
          <View>
            <View className="mb-3.5 flex-row items-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver"
                onPress={onCloseCampusPicker}
                hitSlop={8}
                className="mr-2 size-8 items-center justify-center rounded-full bg-[#f5f5f7] active:opacity-80"
              >
                <Text className="-mt-0.5 text-2xl leading-6.5 text-[#111111]">‹</Text>
              </Pressable>
              <Text className="text-[13px] font-bold text-[#8e8e93]">Entradas al campus</Text>
            </View>

            <ModeToggle
              value={streetProfile}
              onChange={onStreetProfileChange}
              disabled={routing}
            />

            <View className="mt-0.5 self-stretch">
              {entrances.map((entrance, index) => (
                <View key={entrance.id} className="mb-2.5 self-stretch rounded-2xl bg-[#f2f2f4]">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Ir por ${entrance.name}`}
                    disabled={routing}
                    onPress={() => onSelectEntrance?.(entrance)}
                    className="active:opacity-80"
                  >
                    <View className="flex-row items-center px-4 py-4">
                      <View className="mr-3 size-8.5 items-center justify-center rounded-full bg-[#111111]">
                        <Text className="text-sm font-extrabold text-white">{index + 1}</Text>
                      </View>
                      <View className="mr-3 flex-1 justify-center">
                        <Text
                          className="text-[15px] font-bold leading-5 tracking-tight text-[#111111]"
                          numberOfLines={1}
                        >
                          {entrance.name}
                        </Text>
                      </View>
                      {routing ? (
                        <ActivityIndicator size="small" color="#111111" />
                      ) : (
                        <View className="h-9 w-12 items-center justify-center rounded-full bg-[#111111]">
                          <Text className="text-sm font-bold tracking-tight text-white">Ir</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View>
            {distanceLabel ? (
              <View className="mb-5 flex-row items-baseline">
                <Text className="mr-1.5 text-2xl font-bold tracking-tight text-[#111111]">
                  {distanceLabel}
                </Text>
                <Text className="text-[13px] text-[#8e8e93]">
                  {[durationLabel, routeMeta ?? "a pie"].filter(Boolean).join(" · ")}
                </Text>
              </View>
            ) : null}

            {showGoToCampus ? (
              <View className="mb-4">
                <ModeToggle
                  value={streetProfile}
                  onChange={onStreetProfileChange}
                  disabled={routing}
                />
                <View className="mt-5 h-14 items-center justify-center self-stretch overflow-hidden rounded-2xl bg-[#111111]">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ir al campus"
                    onPress={onOpenCampusPicker}
                    className="h-full w-full items-center justify-center px-5 active:bg-[#2c2c2e]"
                  >
                    <Text
                      className="text-center text-[17px] font-bold tracking-tight text-white"
                      style={{ includeFontPadding: false, textAlignVertical: "center" }}
                    >
                      Ir al campus
                    </Text>
                  </Pressable>
                </View>
                <Text className="mt-2.5 text-center text-xs leading-4 text-[#8e8e93]">
                  Luego elige Carrera 86, Calle 16 o Calle 13
                </Text>
              </View>
            ) : null}

            <View className="gap-3">
              {presetStops && presetStops.length > 0 ? (
                presetStops.map((stop, index) => {
                  const last = index === presetStops.length - 1;
                  const label = index === 0 ? "Salida" : last ? "Llegada" : "Parada";
                  return (
                    <View key={`${stop.letter}-${stop.name}`} className="flex-row items-center rounded-2xl bg-[#f7f7f8] px-4 py-3">
                      <View
                        className={`mr-3.5 size-8.5 items-center justify-center rounded-full ${
                          last ? "bg-[#2563eb]" : "bg-[#111111]"
                        }`}
                      >
                        <Text className="text-[13px] font-bold text-white">{stop.letter}</Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-[11px] font-semibold uppercase tracking-wide text-[#8e8e93]">
                          {label}
                        </Text>
                        <Text className="mt-0.75 text-[15px] font-semibold leading-5 text-[#111111]" numberOfLines={2}>
                          {stop.name}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
              <FieldCard
                letter="A"
                label="Origen"
                value={originName}
                active={activeSlot === "origin"}
                filled={Boolean(originName)}
                tone="ink"
                onPress={() => onSelectSlot("origin")}
                onClear={() => onClearSlot("origin")}
              />
              )}

              {presetStops && presetStops.length > 0 ? null : (
              <>
              <View className="z-2 -my-1 items-end pr-4">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Intercambiar origen y destino"
                  disabled={!canSwap || Boolean(presetName)}
                  onPress={onSwap}
                  className={`size-9 items-center justify-center rounded-full border border-[#ebebef] bg-white active:opacity-80 ${
                    canSwap && !presetName ? "" : "opacity-35"
                  }`}
                >
                  <Text className="text-sm font-bold text-[#3a3a3c]">⇅</Text>
                </Pressable>
              </View>

              <FieldCard
                letter="B"
                label="Destino"
                value={destinationName}
                active={activeSlot === "destination"}
                filled={Boolean(destinationName)}
                tone="blue"
                onPress={() => onSelectSlot("destination")}
                onClear={() => onClearSlot("destination")}
              />
              </>
              )}
            </View>

            {error ? (
              <Text className="mt-4.5 text-center text-[13px] font-semibold leading-4.5 text-[#b42318]">
                {error}
              </Text>
            ) : null}

            <View className="mt-5 min-h-12 flex-row items-center justify-between pb-1">
              {canClear ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Limpiar ruta"
                  onPress={onClearAll}
                  hitSlop={8}
                  className="px-1 py-3 active:opacity-80"
                >
                  <Text className="text-sm font-medium text-[#8e8e93]">Limpiar</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ocultar ruta"
                onPress={() => {
                  translateY.value = withSpring(hiddenY.value, SPRING);
                }}
                className="px-1 py-3 active:opacity-80"
              >
                <Text className="text-sm font-medium text-[#8e8e93]">Ocultar</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </AnimatedView>
  );
}
