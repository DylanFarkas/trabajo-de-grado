import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { BODY_MAX, BODY_MIN } from "@/contributions";

const SUGGESTIONS: { label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { label: "Horarios", icon: "schedule" },
  { label: "Servicios", icon: "room-service" },
  { label: "Accesibilidad", icon: "accessible" },
  { label: "Cómo entrar", icon: "door-front" },
  { label: "Consejo", icon: "lightbulb-outline" },
];

type ComposerProps = {
  visible: boolean;
  placeName: string;
  initialBody?: string;
  onSubmit: (body: string) => Promise<void>;
  onClose: () => void;
  onSeeMine?: () => void;
};

export function ContributionComposer({
  visible,
  placeName,
  initialBody = "",
  onSubmit,
  onClose,
  onSeeMine,
}: ComposerProps) {
  const editing = initialBody.length > 0;
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const trimmed = body.trim();
  const canSend = !busy && trimmed.length >= BODY_MIN && trimmed !== initialBody.trim();
  const nearLimit = body.length > BODY_MAX * 0.9;

  const send = async () => {
    if (!canSend) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      if (editing) {
        onClose();
      } else {
        setSent(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  };

  const addSuggestion = (label: string) => {
    setBody((current) => {
      const prefix = `${label}: `;
      if (!current.trim()) return prefix;
      return `${current.replace(/\s+$/, "")}\n${prefix}`;
    });
    inputRef.current?.focus();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between border-b border-[#f0f0f2] px-4 py-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={onClose}
            hitSlop={8}
            className="size-9 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
          >
            <MaterialIcons name="close" size={18} color="#3a3a3c" />
          </Pressable>
          <Text className="text-[16px] font-bold text-[#111111]">
            {sent ? "Aporte enviado" : editing ? "Editar aporte" : "Aportar información"}
          </Text>
          {sent ? (
            <View className="size-9" />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? "Guardar" : "Enviar"}
              disabled={!canSend}
              onPress={() => {
                void send();
              }}
              className={`h-9 min-w-19 flex-row items-center justify-center rounded-full bg-[#111111] px-4 active:opacity-80 ${
                canSend ? "" : "opacity-30"
              }`}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-[14px] font-bold text-white">{editing ? "Guardar" : "Enviar"}</Text>
              )}
            </Pressable>
          )}
        </View>

        {sent ? (
          <View className="flex-1 items-center justify-center px-8 pb-16">
            <View className="size-24 items-center justify-center rounded-full bg-[#eaf6ee]">
              <View className="size-16 items-center justify-center rounded-full bg-[#1f8a4c]">
                <MaterialIcons name="check" size={36} color="#ffffff" />
              </View>
            </View>
            <Text className="mt-6 text-center text-[24px] font-extrabold tracking-tight text-[#111111]">
              ¡Gracias por aportar!
            </Text>
            <Text className="mt-2 text-center font-sans text-[15px] leading-5.5 text-[#6e6e73]">
              Un administrador revisará tu información sobre {placeName}. Cuando se apruebe, todos podrán verla.
            </Text>
            {onSeeMine ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver mis aportes"
                onPress={onSeeMine}
                className="mt-8 h-12 w-full flex-row items-center justify-center rounded-2xl bg-[#111111] active:opacity-80"
              >
                <MaterialIcons name="person-outline" size={18} color="#ffffff" />
                <Text className="ml-2 text-[15px] font-bold text-white">Ver el estado en mi perfil</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Listo"
              onPress={onClose}
              className="mt-2 h-12 w-full items-center justify-center active:opacity-60"
            >
              <Text className="text-[15px] font-semibold text-[#3a3a3c]">Listo</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          >
            <View className="flex-row items-center rounded-2xl bg-[#f5f5f7] px-3 py-2.5">
              <MaterialIcons name="place" size={18} color="#111111" />
              <Text className="ml-1.5 min-w-0 flex-1 text-[14px] font-semibold text-[#111111]" numberOfLines={1}>
                {placeName}
              </Text>
            </View>

            {error ? (
              <View className="mt-4 flex-row items-start rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3">
                <MaterialIcons name="info-outline" size={18} color="#8a1f1f" />
                <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f]">{error}</Text>
              </View>
            ) : null}

            <TextInput
              ref={inputRef}
              value={body}
              onChangeText={setBody}
              autoFocus
              multiline
              maxLength={BODY_MAX}
              editable={!busy}
              textAlignVertical="top"
              placeholder="¿Qué debería saber alguien que visita este espacio? Horarios, servicios, cómo entrar, consejos…"
              placeholderTextColor="#a1a1a6"
              className="mt-4 min-h-44 font-sans text-[17px] leading-6.5 text-[#111111]"
              style={{ margin: 0, padding: 0, includeFontPadding: false }}
              underlineColorAndroid="transparent"
              accessibilityLabel="Información del espacio"
            />

            <View className="mt-2 flex-row items-center justify-between">
              <Text className="font-sans text-[12px] text-[#8e8e93]">
                {trimmed.length > 0 && trimmed.length < BODY_MIN
                  ? `Escribe al menos ${BODY_MIN} caracteres`
                  : " "}
              </Text>
              <Text className={`font-sans text-[12px] ${nearLimit ? "text-[#b25000]" : "text-[#8e8e93]"}`}>
                {body.length}/{BODY_MAX}
              </Text>
            </View>

            <Text className="mb-2.5 mt-6 text-[13px] font-semibold text-[#8e8e93]">Ideas para empezar</Text>
            <View className="flex-row flex-wrap">
              {SUGGESTIONS.map((item) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  accessibilityLabel={`Agregar ${item.label}`}
                  onPress={() => addSuggestion(item.label)}
                  className="mb-2 mr-2 h-9 flex-row items-center rounded-full border border-[#ebebef] bg-white px-3 active:bg-[#f5f5f7]"
                >
                  <MaterialIcons name={item.icon} size={16} color="#3a3a3c" />
                  <Text className="ml-1.5 text-[13px] font-semibold text-[#3a3a3c]">{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <View className="mt-6 flex-row items-start rounded-2xl bg-[#f5f5f7] p-4">
              <MaterialIcons name="verified-user" size={18} color="#6e6e73" />
              <Text className="ml-2.5 flex-1 font-sans text-[13px] leading-5 text-[#6e6e73]">
                Un administrador revisa cada aporte antes de publicarlo. Mientras esté en revisión puedes editarlo
                desde tu perfil, y puedes eliminarlo cuando quieras.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
