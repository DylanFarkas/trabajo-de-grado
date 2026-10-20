import { useState } from "react";
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

import {
  CLOSURE_CATEGORIES,
  CLOSURE_DESCRIPTION_MAX,
  CLOSURE_DESCRIPTION_MIN,
  CLOSURE_DURATIONS,
  type ClosureCategory,
} from "@/closures";
import { formatDistance } from "@/routing/graph";

export type ClosureDraft = {
  category: ClosureCategory;
  description: string;
  estimatedHours: number | null;
};

type ClosureComposerProps = {
  visible: boolean;
  segmentCount: number;
  /** Nombre de la vía, si los tramos tienen uno. */
  placeLabel: string | null;
  onSite: boolean;
  /** Metros del usuario al tramo más cercano. */
  distanceM: number | null;
  simulated: boolean;
  onSubmit: (draft: ClosureDraft) => Promise<void>;
  onClose: () => void;
  onSeeMine?: () => void;
};

export function ClosureComposer({
  visible,
  segmentCount,
  placeLabel,
  onSite,
  distanceM,
  simulated,
  onSubmit,
  onClose,
  onSeeMine,
}: ClosureComposerProps) {
  const [category, setCategory] = useState<ClosureCategory>("obra");
  const [hours, setHours] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const trimmed = body.trim();
  const canSend = !busy && trimmed.length >= CLOSURE_DESCRIPTION_MIN;

  const send = async () => {
    if (!canSend) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ category, description: trimmed, estimatedHours: hours });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo enviar el reporte.");
    } finally {
      setBusy(false);
    }
  };

  const where = placeLabel ?? (segmentCount === 1 ? "1 tramo" : `${segmentCount} tramos`);

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
            {sent ? "Reporte enviado" : "Reportar vía cerrada"}
          </Text>
          {sent ? (
            <View className="size-9" />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar"
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
                <Text className="text-[14px] font-bold text-white">Enviar</Text>
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
              ¡Gracias por avisar!
            </Text>
            <Text className="mt-2 text-center font-sans text-[15px] leading-5.5 text-[#6e6e73]">
              {onSite
                ? "Las rutas ya intentan evitar este tramo. Cuando otras personas cerca lo confirmen, quedará cerrado para todos."
                : "Quedó por confirmar. Empezará a desviar rutas cuando alguien que esté cerca lo valide."}
            </Text>
            {onSeeMine ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver mis reportes"
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
              <MaterialIcons name="block" size={18} color="#b42318" />
              <Text className="ml-1.5 min-w-0 flex-1 text-[14px] font-semibold text-[#111111]" numberOfLines={1}>
                {where}
              </Text>
            </View>

            <View
              className={`mt-3 flex-row items-start rounded-2xl px-3.5 py-3 ${
                onSite ? "bg-[#eaf6ee]" : "bg-[#fff7e6]"
              }`}
            >
              <MaterialIcons
                name={onSite ? "my-location" : "location-searching"}
                size={18}
                color={onSite ? "#1f8a4c" : "#9a5b00"}
              />
              <View className="ml-2 flex-1">
                <Text className={`text-[13px] font-bold leading-5 ${onSite ? "text-[#1f6b3c]" : "text-[#9a5b00]"}`}>
                  {onSite
                    ? "Estás en el sitio"
                    : distanceM != null && Number.isFinite(distanceM)
                      ? `Estás a ${formatDistance(distanceM)} del tramo`
                      : "No sabemos dónde estás"}
                </Text>
                <Text className={`font-sans text-[12px] leading-4.5 ${onSite ? "text-[#1f6b3c]" : "text-[#9a5b00]"}`}>
                  {onSite
                    ? "Tu reporte cuenta como testigo y desvía rutas de inmediato."
                    : "Tu reporte quedará por confirmar hasta que alguien cerca lo valide."}
                </Text>
                {simulated ? (
                  <Text className="mt-1 font-sans text-[11px] text-[#6e6e73]">
                    Modo prueba: tu posición es la ubicación de prueba o el punto A.
                  </Text>
                ) : null}
              </View>
            </View>

            {error ? (
              <View className="mt-4 flex-row items-start rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3">
                <MaterialIcons name="info-outline" size={18} color="#8a1f1f" />
                <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f]">{error}</Text>
              </View>
            ) : null}

            <Text className="mb-2.5 mt-6 text-[13px] font-semibold text-[#8e8e93]">¿Qué pasa?</Text>
            <View className="flex-row flex-wrap">
              {CLOSURE_CATEGORIES.map((item) => {
                const on = item.id === category;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={item.label}
                    onPress={() => setCategory(item.id)}
                    className={`mb-2 mr-2 h-9 justify-center rounded-full border px-3.5 active:opacity-80 ${
                      on ? "border-[#111111] bg-[#111111]" : "border-[#ebebef] bg-white"
                    }`}
                  >
                    <Text className={`text-[13px] font-semibold ${on ? "text-white" : "text-[#3a3a3c]"}`}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mb-2.5 mt-4 text-[13px] font-semibold text-[#8e8e93]">¿Cuánto crees que dure?</Text>
            <View className="flex-row flex-wrap">
              {CLOSURE_DURATIONS.map((item) => {
                const on = item.hours === hours;
                return (
                  <Pressable
                    key={item.label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={item.label}
                    onPress={() => setHours(item.hours)}
                    className={`mb-2 mr-2 h-9 justify-center rounded-full border px-3.5 active:opacity-80 ${
                      on ? "border-[#111111] bg-[#111111]" : "border-[#ebebef] bg-white"
                    }`}
                  >
                    <Text className={`text-[13px] font-semibold ${on ? "text-white" : "text-[#3a3a3c]"}`}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mb-2 mt-4 text-[13px] font-semibold text-[#8e8e93]">Cuéntanos qué ves</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={CLOSURE_DESCRIPTION_MAX}
              editable={!busy}
              textAlignVertical="top"
              placeholder="Ej.: vallas de obra cubren todo el sendero frente al edificio."
              placeholderTextColor="#a1a1a6"
              className="min-h-28 rounded-2xl bg-[#f5f5f7] p-3.5 font-sans text-[16px] leading-6 text-[#111111]"
              underlineColorAndroid="transparent"
              accessibilityLabel="Descripción del cierre"
            />
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="font-sans text-[12px] text-[#8e8e93]">
                {trimmed.length > 0 && trimmed.length < CLOSURE_DESCRIPTION_MIN
                  ? `Escribe al menos ${CLOSURE_DESCRIPTION_MIN} caracteres`
                  : " "}
              </Text>
              <Text className="font-sans text-[12px] text-[#8e8e93]">
                {body.length}/{CLOSURE_DESCRIPTION_MAX}
              </Text>
            </View>

            <View className="mt-6 flex-row items-start rounded-2xl bg-[#f5f5f7] p-4">
              <MaterialIcons name="groups" size={18} color="#6e6e73" />
              <Text className="ml-2.5 flex-1 font-sans text-[13px] leading-5 text-[#6e6e73]">
                No hace falta que un administrador lo apruebe: quienes pasen cerca podrán confirmar si sigue cerrada.
                Si nadie lo confirma, vence solo en pocas horas.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
