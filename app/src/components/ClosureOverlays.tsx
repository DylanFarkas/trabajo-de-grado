import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { categoryLabel, type ActiveClosure, type ClosureVote } from "@/closures";
import { formatDistance } from "@/routing/graph";

type ClosureReportBarProps = {
  top: number;
  selectedCount: number;
  maxSegments: number;
  hint: string | null;
  onCancel: () => void;
  onContinue: () => void;
};

/** Barra del modo reporte: el usuario toca tramos en el mapa y luego describe el cierre. */
export function ClosureReportBar({
  top,
  selectedCount,
  maxSegments,
  hint,
  onCancel,
  onContinue,
}: ClosureReportBarProps) {
  return (
    <View
      className="absolute left-4 right-4 z-30 rounded-[22px] bg-white px-4 py-3 shadow-[0_12px_28px_rgba(17,17,17,0.18)] dark:bg-[#141b25] dark:shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
      style={{ top }}
    >
      <View className="flex-row items-center">
        <View className="size-9 items-center justify-center rounded-full bg-[#fdecec] dark:bg-[#2a1517]">
          <Icon name="block" size={18} colorClassName="accent-[#b42318] dark:accent-[#ff9b93]" />
        </View>
        <View className="ml-3 min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-[#111111] dark:text-[#f2f4f7]">
            {selectedCount === 0
              ? "Toca la vía cerrada"
              : selectedCount === 1
                ? "1 tramo elegido"
                : `${selectedCount} tramos elegidos`}
          </Text>
          <Text className="font-sans text-[12px] leading-4 text-[#6e6e73] dark:text-[#8b95a5]" numberOfLines={2}>
            {hint ?? `Toca otra vez un tramo para quitarlo. Máximo ${maxSegments}.`}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar reporte"
          onPress={onCancel}
          className="h-10 flex-1 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#212a37]"
        >
          <Text className="text-[14px] font-bold text-[#3a3a3c] dark:text-[#c5ccd6]">Cancelar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continuar"
          disabled={selectedCount === 0}
          onPress={onContinue}
          className={`ml-2 h-10 flex-1 items-center justify-center rounded-full bg-[#111111] active:opacity-80 dark:bg-[#f2f4f7] ${
            selectedCount === 0 ? "opacity-30" : ""
          }`}
        >
          <Text className="text-[14px] font-bold text-white dark:text-[#0b0f16]">Continuar</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ClosurePromptCardProps = {
  bottom: number;
  closure: ActiveClosure;
  distanceM: number;
  simulated: boolean;
  onVote: (vote: ClosureVote) => Promise<void>;
  onDismiss: () => void;
  onOpen: () => void;
};

/** Pregunta tipo Waze al pasar cerca de un cierre. No bloquea el mapa ni la ruta. */
export function ClosurePromptCard({
  bottom,
  closure,
  distanceM,
  simulated,
  onVote,
  onDismiss,
  onOpen,
}: ClosurePromptCardProps) {
  const [busy, setBusy] = useState<ClosureVote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vote = async (choice: ClosureVote) => {
    setBusy(choice);
    setError(null);
    try {
      await onVote(choice);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar tu voto.");
      setBusy(null);
    }
  };

  return (
    <View
      className="absolute left-4 right-4 z-30 rounded-[22px] bg-white px-4 py-3.5 shadow-[0_12px_28px_rgba(17,17,17,0.2)] dark:bg-[#141b25] dark:shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
      style={{ bottom }}
      accessibilityRole="alert"
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Ver detalle del cierre" onPress={onOpen}>
        <View className="flex-row items-center">
          <View className="size-9 items-center justify-center rounded-full bg-[#fff7e6] dark:bg-[#2a2213]">
            <Icon name="block" size={18} colorClassName="accent-[#9a5b00] dark:accent-[#f5c46b]" />
          </View>
          <View className="ml-3 min-w-0 flex-1">
            <Text className="text-[15px] font-bold text-[#111111] dark:text-[#f2f4f7]">¿Sigue cerrada esta vía?</Text>
            <Text className="font-sans text-[12px] leading-4 text-[#6e6e73] dark:text-[#8b95a5]" numberOfLines={1}>
              {categoryLabel(closure.category)} · a {formatDistance(distanceM)} · {closure.description}
            </Text>
          </View>
        </View>
      </Pressable>
      {simulated ? (
        <Text className="mt-2 font-sans text-[11px] text-[#8e8e93] dark:text-[#8b95a5]">
          Modo prueba: validando como si estuvieras aquí
        </Text>
      ) : null}
      {error ? (
        <Text className="mt-2 font-sans text-[12px] text-[#b42318] dark:text-[#ff9b93]">{error}</Text>
      ) : null}
      <View className="mt-3 flex-row">
        {(
          [
            { id: "still_closed", label: "Sigue cerrada" },
            { id: "now_open", label: "Ya está abierta" },
          ] as const
        ).map((option, index) => (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            disabled={busy != null}
            onPress={() => {
              void vote(option.id);
            }}
            className={`h-10 flex-1 items-center justify-center rounded-full active:opacity-80 ${
              index > 0 ? "ml-2 bg-[#f2f2f4] dark:bg-[#212a37]" : "bg-[#111111] dark:bg-[#f2f4f7]"
            }`}
          >
            {busy === option.id ? (
              <ActivityIndicator size="small" colorClassName={index > 0 ? "accent-[#111111]" : "accent-white"} />
            ) : (
              <Text
                className={`text-[13px] font-bold ${
                  index > 0 ? "text-[#111111] dark:text-[#f2f4f7]" : "text-white dark:text-[#0b0f16]"
                }`}
              >
                {option.label}
              </Text>
            )}
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ahora no"
          disabled={busy != null}
          onPress={onDismiss}
          className="ml-2 h-10 items-center justify-center px-2 active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-[#6e6e73] dark:text-[#8b95a5]">Ahora no</Text>
        </Pressable>
      </View>
    </View>
  );
}
