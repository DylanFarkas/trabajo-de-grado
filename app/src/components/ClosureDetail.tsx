import { useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import {
  CLOSURE_STATUS_LABEL,
  categoryLabel,
  timeAgo,
  type ActiveClosure,
  type ClosureVote,
} from "@/closures";
import { formatDistance } from "@/routing/graph";

type ClosureDetailProps = {
  closure: ActiveClosure | null;
  myVote: ClosureVote | null;
  signedIn: boolean;
  onSite: boolean;
  distanceM: number | null;
  simulated: boolean;
  onVote: (vote: ClosureVote) => Promise<void>;
  onSignIn: () => void;
  onClose: () => void;
};

const STATUS_TONE: Record<ActiveClosure["status"], { bg: string; text: string }> = {
  candidate: { bg: "bg-[#f2f2f4]", text: "text-[#3a3a3c]" },
  provisional: { bg: "bg-[#fff7e6]", text: "text-[#9a5b00]" },
  confirmed: { bg: "bg-[#fdecec]", text: "text-[#b42318]" },
};

function expiresLabel(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return "vence en cualquier momento";
  if (minutes < 60) return `vence en ${minutes} min si nadie lo confirma`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `vence en ${hours} h si nadie lo confirma`;
  return `vence en ${Math.round(hours / 24)} d`;
}

export function ClosureDetail({
  closure,
  myVote,
  signedIn,
  onSite,
  distanceM,
  simulated,
  onVote,
  onSignIn,
  onClose,
}: ClosureDetailProps) {
  const [busy, setBusy] = useState<ClosureVote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vote = async (choice: ClosureVote) => {
    setBusy(choice);
    setError(null);
    try {
      await onVote(choice);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar tu voto.");
    } finally {
      setBusy(null);
    }
  };

  const tone = closure ? STATUS_TONE[closure.status] : STATUS_TONE.candidate;
  const admin = closure?.source === "admin";

  return (
    <Modal
      visible={closure != null}
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
          <Text className="text-[16px] font-bold text-[#111111]">Vía cerrada</Text>
          <View className="size-9" />
        </View>

        {closure ? (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View className="flex-row flex-wrap items-center">
              <View className={`mr-2 rounded-full px-2.5 py-1 ${tone.bg}`}>
                <Text className={`text-[12px] font-bold uppercase tracking-wide ${tone.text}`}>
                  {CLOSURE_STATUS_LABEL[closure.status]}
                </Text>
              </View>
              <Text className="text-[13px] font-semibold text-[#6e6e73]">
                {categoryLabel(closure.category)}
                {admin ? " · Universidad" : ""}
              </Text>
            </View>

            <Text className="mt-4 font-sans text-[17px] leading-6.5 text-[#111111]">{closure.description}</Text>

            <View className="mt-4 rounded-2xl bg-[#f5f5f7] p-3.5">
              <Text className="font-sans text-[13px] leading-5 text-[#3a3a3c]">
                Reportado {timeAgo(closure.createdAt)}
                {closure.lastConfirmedAt ? ` · última confirmación ${timeAgo(closure.lastConfirmedAt)}` : ""}
              </Text>
              <Text className="mt-1 font-sans text-[13px] leading-5 text-[#3a3a3c]">
                {admin ? `Cierre oficial · ${expiresLabel(closure.expiresAt)}` : expiresLabel(closure.expiresAt)}
              </Text>
              {!admin ? (
                <Text className="mt-1 font-sans text-[13px] leading-5 text-[#3a3a3c]">
                  {closure.confirmScore} puntos a favor · {closure.denyScore} en contra · se confirma con 6
                </Text>
              ) : null}
            </View>

            {error ? (
              <View className="mt-4 flex-row items-start rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3">
                <MaterialIcons name="info-outline" size={18} color="#8a1f1f" />
                <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f]">{error}</Text>
              </View>
            ) : null}

            {admin ? null : closure.mine ? (
              <Text className="mt-6 font-sans text-[14px] leading-5 text-[#6e6e73]">
                Este es tu reporte. Otras personas que pasen cerca lo confirmarán o dirán que ya está abierta.
              </Text>
            ) : !signedIn ? (
              <View className="mt-6 flex-row items-center">
                <View className="min-w-0 flex-1 pr-3">
                  <Text className="text-[15px] font-bold text-[#111111]">¿Pasas por aquí?</Text>
                  <Text className="mt-0.5 font-sans text-[13px] text-[#6e6e73]">
                    Inicia sesión para confirmar si sigue cerrada.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Iniciar sesión"
                  onPress={onSignIn}
                  className="h-11 flex-row items-center justify-center rounded-full bg-[#111111] px-5 active:opacity-80"
                >
                  <Text className="text-[14px] font-bold text-white">Entrar</Text>
                </Pressable>
              </View>
            ) : (
              <View className="mt-6">
                <Text className="text-[15px] font-bold text-[#111111]">¿Sigue cerrada?</Text>
                <Text className="mt-0.5 font-sans text-[13px] leading-5 text-[#6e6e73]">
                  {onSite
                    ? "Estás cerca: tu voto vale doble."
                    : distanceM != null && Number.isFinite(distanceM)
                      ? `Estás a ${formatDistance(distanceM)}: tu voto cuenta, pero vale más en el sitio.`
                      : "Tu voto vale más si estás en el sitio."}
                </Text>
                {simulated ? (
                  <Text className="mt-1 font-sans text-[11px] text-[#6e6e73]">
                    Modo prueba: validando como si estuvieras en la ubicación de prueba o el punto A.
                  </Text>
                ) : null}
                <View className="mt-3 flex-row">
                  {(
                    [
                      { id: "still_closed", label: "Sigue cerrada", icon: "block" },
                      { id: "now_open", label: "Ya está abierta", icon: "check-circle-outline" },
                    ] as const
                  ).map((option, index) => {
                    const on = myVote === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, busy: busy === option.id }}
                        accessibilityLabel={option.label}
                        disabled={busy != null}
                        onPress={() => {
                          void vote(option.id);
                        }}
                        className={`h-12 flex-1 flex-row items-center justify-center rounded-2xl active:opacity-80 ${
                          index > 0 ? "ml-2" : ""
                        } ${on ? "bg-[#111111]" : "border border-[#e5e5ea] bg-white"}`}
                      >
                        {busy === option.id ? (
                          <ActivityIndicator size="small" color={on ? "#ffffff" : "#111111"} />
                        ) : (
                          <>
                            <MaterialIcons name={option.icon} size={18} color={on ? "#ffffff" : "#111111"} />
                            <Text className={`ml-1.5 text-[14px] font-bold ${on ? "text-white" : "text-[#111111]"}`}>
                              {option.label}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                {myVote ? (
                  <Text className="mt-2 font-sans text-[12px] text-[#8e8e93]">
                    Ya votaste. Puedes cambiar tu voto si la situación cambió.
                  </Text>
                ) : null}
              </View>
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}
