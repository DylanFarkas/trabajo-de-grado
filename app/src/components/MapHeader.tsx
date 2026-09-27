import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import type { CampusPlace } from "@/places";

type MapHeaderProps = {
  topInset: number;
  status?: string;
  showSearch?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  results: CampusPlace[];
  onSelectResult: (place: CampusPlace) => void;
  placeholder: string;
  endInset?: number;
};

export function MapHeader({
  topInset,
  status,
  showSearch = true,
  query,
  onQueryChange,
  results,
  onSelectResult,
  placeholder,
  endInset = 16,
}: MapHeaderProps) {
  const loading = Boolean(status);
  const showResults = showSearch && query.trim().length > 0;

  if (!showSearch && !loading) return null;

  return (
    <View
      className="absolute left-4 z-40"
      style={{ top: topInset + 8, right: endInset }}
      pointerEvents="box-none"
    >
      {showSearch ? (
        <View className="h-12 min-w-0 flex-row items-center overflow-hidden rounded-full bg-white pl-1.5 pr-2 shadow-lg">
          <View
            className="mr-3 size-9 items-center justify-center rounded-full bg-[#111111]"
            accessibilityLabel="Universidad del Valle"
          >
            <Text className="text-[11px] font-extrabold tracking-wide text-white">UV</Text>
          </View>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder={placeholder}
            placeholderTextColor="#8e8e93"
            className="h-12 min-w-0 flex-1 font-sans text-base text-[#111111]"
            style={{ paddingVertical: 0, paddingHorizontal: 0, margin: 0, includeFontPadding: false }}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            underlineColorAndroid="transparent"
            accessibilityLabel={placeholder}
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
      ) : null}

      {loading && !showResults ? (
        <View className="mt-2 flex-row items-center self-center rounded-full bg-white/95 px-3 py-2 shadow-[0_6px_16px_rgba(17,17,17,0.1)]">
          <ActivityIndicator size="small" color="#111111" />
          <Text className="ml-2 text-[13px] font-semibold text-[#111111]">{status}</Text>
        </View>
      ) : null}

      {showResults ? (
        <View className="mt-2 overflow-hidden rounded-[22px] bg-white py-2 shadow-[0_16px_36px_rgba(17,17,17,0.16)]">
          {results.length === 0 ? (
            <Text className="px-4 py-3 font-sans text-[15px] text-[#3a3a3c]">
              No hay edificios con ese nombre
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" className="max-h-70">
              {results.map((place) => (
                <Pressable
                  key={place.id}
                  accessibilityRole="button"
                  accessibilityLabel={place.title}
                  onPress={() => onSelectResult(place)}
                  className="px-2"
                >
                  {({ pressed }) => (
                    <View
                      className={`w-full flex-row items-center rounded-2xl px-2 py-2 ${
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
                        <Text className="mt-0.5 font-sans text-[13px] text-[#8e8e93]" numberOfLines={1}>
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
