import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { SnapSheet } from "@/components/SnapSheet";
import type { CampusEntrance } from "@/constants/entrances";
import type { StreetProfile } from "@/routing/openRouteService";

export type RouteSlot = "origin" | "destination";

type RouteSheetProps = {
  bottomOffset: number;
  maxHeight: number;
  onHeight?: (height: number) => void;
  searchSlot: RouteSlot | null;
  onPickSlot: (slot: RouteSlot) => void;
  originName: string | null;
  destinationName: string | null;
  onClearSlot: (slot: RouteSlot) => void;
  onSwap: () => void;
  onClose: () => void;
  distanceLabel: string | null;
  durationLabel: string | null;
  routeMeta: string | null;
  error: string | null;
  routing?: boolean;
  locating?: boolean;
  onUseMyLocation?: () => void;
  showGoToCampus?: boolean;
  campusPickerOpen?: boolean;
  entrances?: CampusEntrance[];
  relocatingEntranceId?: string | null;
  onOpenCampusPicker?: () => void;
  onCloseCampusPicker?: () => void;
  onSelectEntrance?: (entrance: CampusEntrance) => void;
  onRelocateEntrance?: (entranceId: string) => void;
  streetProfile?: StreetProfile;
  onStreetProfileChange?: (profile: StreetProfile) => void;
  presetName?: string | null;
  presetStops?: { letter: string; name: string }[] | null;
  pendingPresetName?: string | null;
  visible?: boolean;
  onExited?: () => void;
};

function ModeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: StreetProfile;
  onChange?: (profile: StreetProfile) => void;
  disabled?: boolean;
}) {
  const options: { id: StreetProfile; label: string; icon: "directions-walk" | "directions-car" }[] = [
    { id: "foot-walking", label: "A pie", icon: "directions-walk" },
    { id: "driving-car", label: "En carro", icon: "directions-car" },
  ];
  return (
    <View
      className={`mb-4 flex-row rounded-2xl bg-[#f2f2f4] p-1 ${disabled ? "opacity-50" : ""}`}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const on = value === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => onChange?.(option.id)}
            className={`h-11 flex-1 flex-row items-center justify-center rounded-xl active:opacity-80 ${
              on ? "bg-white shadow-sm" : ""
            }`}
          >
            <MaterialIcons name={option.icon} size={18} color={on ? "#111111" : "#8e8e93"} />
            <Text className={`ml-2 text-sm font-bold ${on ? "text-[#111111]" : "text-[#8e8e93]"}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EndpointRow({
  slot,
  value,
  active,
  onPress,
  onClear,
}: {
  slot: RouteSlot;
  value: string | null;
  active: boolean;
  onPress: () => void;
  onClear: () => void;
}) {
  const isOrigin = slot === "origin";
  const placeholder = isOrigin ? "¿Desde dónde sales?" : "¿A dónde vas?";
  const label = isOrigin ? "Salida" : "Llegada";
  return (
    <View
      className={`min-h-14 flex-row items-center rounded-2xl px-3 ${
        active ? "bg-white shadow-[0_0_0_2px_#111111]" : ""
      }`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value ?? "Sin elegir"}`}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        className="min-h-14 min-w-0 flex-1 flex-row items-center active:opacity-70"
      >
        <View
          className={`mr-3 size-3 rounded-full ${isOrigin ? "border-[3px] border-[#111111]" : "bg-[#1d4ed8]"}`}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-[#8e8e93]">
            {label}
          </Text>
          <Text
            className={`text-[15px] font-semibold ${value ? "text-[#111111]" : "text-[#aeaeb2]"}`}
            numberOfLines={1}
          >
            {value ?? placeholder}
          </Text>
        </View>
      </Pressable>
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Quitar ${label.toLowerCase()}`}
          hitSlop={8}
          onPress={onClear}
          className="ml-2 size-7 items-center justify-center rounded-full bg-[#ececef] active:opacity-80"
        >
          <MaterialIcons name="close" size={14} color="#6b6b70" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function RouteSheet({
  bottomOffset,
  maxHeight,
  onHeight,
  searchSlot,
  onPickSlot,
  originName,
  destinationName,
  onClearSlot,
  onSwap,
  onClose,
  distanceLabel,
  durationLabel,
  routeMeta,
  error,
  routing = false,
  locating = false,
  onUseMyLocation,
  showGoToCampus = false,
  campusPickerOpen = false,
  entrances = [],
  relocatingEntranceId = null,
  onOpenCampusPicker,
  onCloseCampusPicker,
  onSelectEntrance,
  streetProfile = "foot-walking",
  onStreetProfileChange,
  presetName = null,
  presetStops = null,
  pendingPresetName = null,
  visible,
  onExited,
}: RouteSheetProps) {
  const [expanded, setExpanded] = useState(true);
  const hasPreset = Boolean(presetStops && presetStops.length > 0);

  useEffect(() => {
    setExpanded(true);
  }, [searchSlot, campusPickerOpen, showGoToCampus, presetName, pendingPresetName, error]);

  const title = campusPickerOpen
    ? "Entradas al campus"
    : presetName ?? pendingPresetName ?? (destinationName ? `Ir a ${destinationName}` : "Tu ruta");

  const summary = campusPickerOpen
    ? relocatingEntranceId
      ? "Toca el mapa para colocar la entrada"
      : "Elige por cuál entrada llegar"
    : routing
      ? "Calculando la mejor ruta…"
      : distanceLabel
        ? [distanceLabel, durationLabel, routeMeta].filter(Boolean).join(" · ")
        : pendingPresetName
          ? "Elige desde dónde sales para empezar"
          : searchSlot === "origin"
            ? "Elige desde dónde sales"
            : searchSlot === "destination"
              ? "Elige a dónde vas"
              : "Origen y destino";

  const canSwap = Boolean(originName || destinationName) && !hasPreset;

  return (
    <SnapSheet
      bottomOffset={bottomOffset}
      maxHeight={maxHeight}
      onHeight={onHeight}
      visible={visible}
      onExited={onExited}
      expanded={expanded}
      onExpandedChange={setExpanded}
      header={({ toggle }) => (
        <View className="flex-row items-center">
          {campusPickerOpen ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={onCloseCampusPicker}
              hitSlop={8}
              className="mr-2 size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
            >
              <MaterialIcons name="arrow-back" size={18} color="#111111" />
            </Pressable>
          ) : null}
          <Pressable
            accessible={false}
            onPress={toggle}
            className="mr-2 min-w-0 flex-1 active:opacity-70"
          >
            <Text className="text-lg font-bold tracking-tight text-[#111111]" numberOfLines={1}>
              {title}
            </Text>
            <View className="mt-0.5 flex-row items-center">
              {routing ? <ActivityIndicator size="small" color="#8e8e93" /> : null}
              <Text
                className={`text-[13px] mb-2 ${distanceLabel ? "font-semibold text-[#1d4ed8]" : "text-[#8e8e93]"} ${
                  routing ? "ml-2" : ""
                }`}
                numberOfLines={1}
              >
                {summary}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Minimizar ruta" : "Mostrar ruta"}
            onPress={toggle}
            hitSlop={6}
            className="mr-2 size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
          >
            <MaterialIcons name={expanded ? "expand-more" : "expand-less"} size={20} color="#3a3a3c" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Terminar ruta"
            onPress={onClose}
            hitSlop={6}
            className="size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
          >
            <MaterialIcons name="close" size={18} color="#3a3a3c" />
          </Pressable>
        </View>
      )}
    >
      {campusPickerOpen ? (
        <View>
          <ModeToggle value={streetProfile} onChange={onStreetProfileChange} disabled={routing} />
          {entrances.map((entrance, index) => (
            <Pressable
              key={entrance.id}
              accessibilityRole="button"
              accessibilityLabel={`Ir por ${entrance.name}`}
              disabled={routing}
              onPress={() => onSelectEntrance?.(entrance)}
              className="mb-2 flex-row items-center rounded-2xl bg-[#f7f7f8] px-4 py-3 active:opacity-80"
            >
              <View className="mr-3 size-8 items-center justify-center rounded-full bg-[#111111]">
                <Text className="text-sm font-extrabold text-white">{index + 1}</Text>
              </View>
              <Text
                className="mr-3 min-w-0 flex-1 text-[15px] font-semibold text-[#111111]"
                numberOfLines={1}
              >
                {entrance.name}
              </Text>
              {routing ? (
                <ActivityIndicator size="small" color="#111111" />
              ) : (
                <MaterialIcons name="arrow-forward" size={20} color="#111111" />
              )}
            </Pressable>
          ))}
        </View>
      ) : hasPreset ? (
        <View>
          {presetStops!.map((stop, index) => {
            const last = index === presetStops!.length - 1;
            return (
              <View key={`${stop.letter}-${stop.name}`} className="flex-row">
                <View className="mr-3 items-center">
                  <View
                    className={`size-7 items-center justify-center rounded-full ${
                      last ? "bg-[#1d4ed8]" : "bg-[#111111]"
                    }`}
                  >
                    <Text className="text-xs font-bold text-white">{stop.letter}</Text>
                  </View>
                  {!last ? <View className="w-0.5 flex-1 bg-[#e0e0e5]" /> : null}
                </View>
                <Text
                  className="min-w-0 flex-1 pb-4 pt-1 text-[15px] font-semibold text-[#111111]"
                  numberOfLines={2}
                >
                  {stop.name}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View>
          {pendingPresetName ? null : (
            <View className="flex-row items-center rounded-[20px] bg-[#f7f7f8] p-1">
              <View className="min-w-0 flex-1">
                <EndpointRow
                  slot="origin"
                  value={originName}
                  active={searchSlot === "origin"}
                  onPress={() => onPickSlot("origin")}
                  onClear={() => onClearSlot("origin")}
                />
                <EndpointRow
                  slot="destination"
                  value={destinationName}
                  active={searchSlot === "destination"}
                  onPress={() => onPickSlot("destination")}
                  onClear={() => onClearSlot("destination")}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Intercambiar salida y llegada"
                disabled={!canSwap}
                onPress={onSwap}
                className={`mx-2 size-9 items-center justify-center rounded-full bg-white active:opacity-80 ${
                  canSwap ? "" : "opacity-35"
                }`}
              >
                <MaterialIcons name="swap-vert" size={20} color="#3a3a3c" />
              </Pressable>
            </View>
          )}

          {searchSlot === "origin" && onUseMyLocation ? (
            <View className={pendingPresetName ? "" : "mt-3"}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Usar mi ubicación como salida"
                disabled={locating}
                onPress={onUseMyLocation}
                className="h-12 flex-row items-center justify-center rounded-2xl bg-[#111111] active:opacity-80"
              >
                {locating ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <MaterialIcons name="my-location" size={18} color="#ffffff" />
                )}
                <Text className="ml-2 text-[15px] font-bold text-white">Usar mi ubicación</Text>
              </Pressable>
              <Text className="mt-2 text-center font-sans text-xs text-[#8e8e93]">
                O búscalo arriba, o toca un edificio en el mapa
              </Text>
            </View>
          ) : null}

          {searchSlot === "destination" ? (
            <Text className="mt-3 text-center font-sans text-xs text-[#8e8e93]">
              Búscalo arriba o toca un edificio en el mapa
            </Text>
          ) : null}

          {showGoToCampus ? (
            <View className="mt-4">
              <ModeToggle value={streetProfile} onChange={onStreetProfileChange} disabled={routing} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ir al campus"
                onPress={onOpenCampusPicker}
                className="h-12 items-center justify-center rounded-2xl bg-[#111111] active:opacity-80"
              >
                <Text className="text-[15px] font-bold text-white">Ir al campus</Text>
              </Pressable>
              <Text className="mt-2 text-center font-sans text-xs text-[#8e8e93]">
                Luego elige Carrera 86, Calle 16 o Calle 13
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {error ? (
        <View className="mt-3 flex-row items-start rounded-2xl bg-[#fff5f5] px-3 py-3">
          <MaterialIcons name="info-outline" size={18} color="#b42318" />
          <Text className="ml-2 flex-1 text-[13px] font-semibold leading-5 text-[#b42318]">
            {error}
          </Text>
        </View>
      ) : null}
    </SnapSheet>
  );
}
