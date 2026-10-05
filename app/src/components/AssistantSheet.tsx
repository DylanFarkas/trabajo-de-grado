import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { Icon } from "@/components/Icon";
import { SnapSheet } from "@/components/SnapSheet";

const EXAMPLES = [
  "Quiero ir al B13",
  "Desde E19 al B13",
  "Llévame a la biblioteca",
] as const;

type AssistantSheetProps = {
  bottomOffset: number;
  maxHeight: number;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  mockLocationActive?: boolean;
  onToggleMockLocation?: () => void;
  onHeight?: (height: number) => void;
  visible?: boolean;
  onExited?: () => void;
};

export function AssistantSheet({
  bottomOffset,
  maxHeight,
  prompt,
  onPromptChange,
  onSubmit,
  onClose,
  loading = false,
  error = null,
  mockLocationActive = false,
  onToggleMockLocation,
  onHeight,
  visible,
  onExited,
}: AssistantSheetProps) {
  const submitDisabled = loading || prompt.trim().length === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="absolute left-0 right-0 z-30"
      style={{ bottom: bottomOffset }}
      pointerEvents={visible === false ? "none" : "box-none"}
    >
      <SnapSheet
        absolute={false}
        bottomOffset={0}
        maxHeight={maxHeight}
        onHeight={onHeight}
        visible={visible}
        onExited={onExited}
        header={({ expanded, toggle }) => (
          <View className="flex-row items-start">
            <Pressable accessible={false} onPress={toggle} className="min-w-0 flex-1 pr-3 active:opacity-70">
              <Text className="text-[22px] font-extrabold tracking-tight text-[#111111] dark:text-[#f2f4f7]">
                Asistente de rutas
              </Text>
              <Text className="mt-1 mb-3 text-sm font-medium text-[#8e8e93] dark:text-[#8b95a5]">
                Di a dónde quieres ir en el campus
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Minimizar asistente" : "Mostrar asistente"}
              hitSlop={8}
              disabled={loading}
              onPress={toggle}
              className="mr-2 active:opacity-80"
            >
              <View className="size-9 items-center justify-center rounded-full bg-[#f2f2f4] dark:bg-[#1f2632]">
                <Icon
                  name={expanded ? "expand-more" : "expand-less"}
                  size={22}
                  colorClassName="accent-[#3a3a3c] dark:accent-[#c5ccd6]"
                />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar asistente"
              hitSlop={10}
              disabled={loading}
              onPress={onClose}
              className="active:opacity-80"
            >
              <View className="size-9 items-center justify-center rounded-full bg-[#f2f2f4] dark:bg-[#1f2632]">
                <Icon name="close" size={22} colorClassName="accent-[#3a3a3c] dark:accent-[#c5ccd6]" />
              </View>
            </Pressable>
          </View>
        )}
      >
        <View className="mb-3 rounded-[20px] bg-[#f5f5f7] p-3.5 dark:bg-[#18202a]">
          <TextInput
            value={prompt}
            onChangeText={onPromptChange}
            placeholder="Ej: quiero ir al B13"
            placeholderTextColorClassName="accent-[#8e8e93] dark:accent-[#6b7584]"
            selectionColorClassName="accent-[#111111] dark:accent-[#93c5fd]"
            className="min-h-22 px-0 pb-3 font-sans text-[17px] leading-6 text-[#111111] dark:text-[#f2f4f7]"
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
              className={`h-12 items-center justify-center rounded-2xl bg-[#111111] dark:bg-[#f2f4f7] ${
                submitDisabled ? "opacity-40" : ""
              }`}
            >
              {loading ? (
                <ActivityIndicator size="small" colorClassName="accent-white dark:accent-[#0b0f16]" />
              ) : (
                <View className="flex-row items-center">
                  <Icon name="auto-awesome" size={18} colorClassName="accent-white dark:accent-[#0b0f16]" />
                  <Text className="ml-2 text-base font-bold text-white dark:text-[#0b0f16]">Generar ruta</Text>
                </View>
              )}
            </View>
          </Pressable>
        </View>

        {error ? (
          <View className="mb-3 flex-row items-start rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3 dark:border-[rgba(255,120,110,0.18)] dark:bg-[#2a1517]">
            <Icon name="info-outline" size={18} colorClassName="accent-[#8a1f1f] dark:accent-[#ff9b93]" />
            <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f] dark:text-[#ff9b93]">
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
                mockLocationActive ? "bg-[#111111] dark:bg-[#f2f4f7]" : "bg-[#f5f5f7] dark:bg-[#18202a]"
              }`}
            >
              <View
                className={`mr-3 size-9 items-center justify-center rounded-xl bg-white ${
                  mockLocationActive ? "dark:bg-[#0b0f16]/10" : "dark:bg-[#232c3a]"
                }`}
              >
                <Icon
                  name="place"
                  size={20}
                  colorClassName={
                    mockLocationActive
                      ? "accent-[#111111] dark:accent-[#0b0f16]"
                      : "accent-[#3a3a3c] dark:accent-[#c5ccd6]"
                  }
                />
              </View>
              <View className="min-w-0 flex-1 pr-2.5">
                <Text
                  className={`text-[15px] font-bold ${
                    mockLocationActive ? "text-white dark:text-[#0b0f16]" : "text-[#111111] dark:text-[#f2f4f7]"
                  }`}
                >
                  Ubicación de prueba
                </Text>
                <Text
                  className={`mt-0.75 font-sans text-xs leading-4 ${
                    mockLocationActive ? "text-white/70 dark:text-[#0b0f16]/60" : "text-[#8e8e93] dark:text-[#8b95a5]"
                  }`}
                >
                  {mockLocationActive
                    ? "Activa · cerca de la Biblioteca (E19)"
                    : "Actívala si estás fuera del campus"}
                </Text>
              </View>
              <View
                className={`h-6.5 w-11 flex-row items-center rounded-full px-0.75 ${
                  mockLocationActive
                    ? "justify-end bg-[#34c759]"
                    : "justify-start bg-[#d8d8dc] dark:bg-[#323b49]"
                }`}
              >
                <View className="size-5 rounded-full bg-white" />
              </View>
            </View>
          </Pressable>
        ) : null}

        <Text className="mb-2.5 text-[13px] font-semibold text-[#8e8e93] dark:text-[#8b95a5]">Prueba con</Text>
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
              <View className="mx-1 mb-2 rounded-full bg-[#f5f5f7] px-3 py-2.25 dark:bg-[#1f2632]">
                <Text className="text-[13px] font-semibold text-[#3a3a3c] dark:text-[#c5ccd6]">{example}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </SnapSheet>
    </KeyboardAvoidingView>
  );
}
