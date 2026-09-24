import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const EXAMPLES = [
  "Quiero ir al B13",
  "Desde E19 al B13",
  "Llévame a la biblioteca",
] as const;

type AssistantSheetProps = {
  visible: boolean;
  bottomInset: number;
  topInset: number;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  mockLocationActive?: boolean;
  onToggleMockLocation?: () => void;
};

export function AssistantSheet({
  visible,
  bottomInset,
  topInset,
  prompt,
  onPromptChange,
  onSubmit,
  onClose,
  loading = false,
  error = null,
  mockLocationActive = false,
  onToggleMockLocation,
}: AssistantSheetProps) {
  if (!visible) return null;

  const submitDisabled = loading || prompt.trim().length === 0;

  return (
    <View className="absolute inset-0 z-60" pointerEvents="box-none">
      <Pressable
        className="absolute inset-0 bg-[#111111]/40"
        accessibilityRole="button"
        accessibilityLabel="Cerrar asistente"
        onPress={loading ? undefined : onClose}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
        style={{ paddingTop: topInset + 12 }}
        pointerEvents="box-none"
      >
        <View
          className="max-h-[92%] rounded-t-[28px] bg-white px-5 pt-2.5 shadow-[0_-4px_16px_rgba(17,17,17,0.18)]"
          style={{ paddingBottom: Math.max(bottomInset, 16) + 12 }}
        >
          <View className="mb-3.5 h-1 w-10 self-center rounded-sm bg-[#d8d8dc]" />

          <View className="mb-3.5 flex-row items-start">
            <View className="min-w-0 flex-1 pr-3">
              <Text className="text-[22px] font-extrabold tracking-tight text-[#111111]">
                Asistente de rutas
              </Text>
              <Text className="mt-1 text-sm font-medium text-[#8e8e93]">
                Di a dónde quieres ir en el campus
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              hitSlop={10}
              disabled={loading}
              onPress={onClose}
              className="active:opacity-80"
            >
              <View className="size-9 items-center justify-center rounded-full bg-[#f2f2f4]">
                <MaterialIcons name="close" size={22} color="#3a3a3c" />
              </View>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerClassName="pb-1"
          >
            <View className="mb-3 rounded-[20px] bg-[#f5f5f7] p-3.5">
              <TextInput
                value={prompt}
                onChangeText={onPromptChange}
                placeholder="Ej: quiero ir al B13"
                placeholderTextColor="#8e8e93"
                className="min-h-22 px-0 pb-3 text-[17px] leading-6 text-[#111111]"
                style={{
                  margin: 0,
                  includeFontPadding: false,
                  paddingTop: Platform.OS === "android" ? 4 : 2,
                }}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                autoCorrect
                autoCapitalize="sentences"
                editable={!loading}
                underlineColorAndroid="transparent"
                importantForAutofill="no"
                accessibilityLabel="Pedido en lenguaje natural"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Generar ruta con el asistente"
                disabled={submitDisabled}
                onPress={onSubmit}
                className="active:opacity-80"
              >
                <View
                  className={`h-12 items-center justify-center rounded-2xl bg-[#111111] ${
                    submitDisabled ? "opacity-40" : ""
                  }`}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View className="flex-row items-center">
                      <MaterialIcons name="auto-awesome" size={18} color="#ffffff" />
                      <Text className="ml-2 text-base font-bold text-white">Generar ruta</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            </View>

            {error ? (
              <View className="mb-3 flex-row items-start rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3">
                <MaterialIcons name="info-outline" size={18} color="#8a1f1f" />
                <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f]">
                  {error}
                </Text>
              </View>
            ) : null}

            {onToggleMockLocation ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: mockLocationActive }}
                accessibilityLabel="Ubicación de prueba en el campus"
                disabled={loading}
                onPress={onToggleMockLocation}
                className="active:opacity-80"
              >
                <View
                  className={`mb-4 flex-row items-center rounded-[18px] p-3.5 ${
                    mockLocationActive ? "bg-[#111111]" : "bg-[#f5f5f7]"
                  }`}
                >
                  <View className="mr-3 size-9 items-center justify-center rounded-xl bg-white">
                    <MaterialIcons
                      name="place"
                      size={20}
                      color={mockLocationActive ? "#111111" : "#3a3a3c"}
                    />
                  </View>
                  <View className="min-w-0 flex-1 pr-2.5">
                    <Text
                      className={`text-[15px] font-bold ${
                        mockLocationActive ? "text-white" : "text-[#111111]"
                      }`}
                    >
                      Ubicación de prueba
                    </Text>
                    <Text
                      className={`mt-0.75 text-xs leading-4 ${
                        mockLocationActive ? "text-white/70" : "text-[#8e8e93]"
                      }`}
                    >
                      {mockLocationActive
                        ? "Activa · cerca de la Biblioteca (E19)"
                        : "Actívala si estás fuera del campus"}
                    </Text>
                  </View>
                  <View
                    className={`h-6.5 w-11 flex-row items-center rounded-full px-0.75 ${
                      mockLocationActive ? "justify-end bg-[#34c759]" : "justify-start bg-[#d8d8dc]"
                    }`}
                  >
                    <View className="size-5 rounded-full bg-white" />
                  </View>
                </View>
              </Pressable>
            ) : null}

            <Text className="mb-2.5 text-[13px] font-semibold text-[#8e8e93]">Prueba con</Text>
            <View className="-mx-1 mb-2 flex-row flex-wrap">
              {EXAMPLES.map((example) => (
                <Pressable
                  key={example}
                  accessibilityRole="button"
                  accessibilityLabel={`Usar ejemplo: ${example}`}
                  disabled={loading}
                  onPress={() => onPromptChange(example)}
                  className="active:opacity-80"
                >
                  <View className="mx-1 mb-2 rounded-full bg-[#f5f5f7] px-3 py-2.25">
                    <Text className="text-[13px] font-semibold text-[#3a3a3c]">{example}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
