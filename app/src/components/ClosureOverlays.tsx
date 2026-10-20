import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { categoryLabel, type ActiveClosure, type ClosureVote } from "@/closures";
import { formatDistance } from "@/routing/graph";

type ClosureReportBarProps = {
  top: number;
  bottom: number;
  selectedCount: number;
  maxSegments: number;
  hint: string | null;
  /** Nombres de las vías elegidas, sin el conteo. */
  placeLabel: string | null;
  onCancel: () => void;
  onContinue: () => void;
  onUndo: () => void;
  onClear: () => void;
  onHeight?: (height: number) => void;
};

/**
 * Modo selección de tramos: una barra compacta arriba (reemplaza al buscador)
 * y el panel de progreso y acciones abajo, en la zona del pulgar. El centro
 * del mapa queda libre para tocar los tramos.
 */
export function ClosureReportBar({
  top,
  bottom,
  selectedCount,
  maxSegments,
  hint,
  placeLabel,
  onCancel,
  onContinue,
  onUndo,
  onClear,
  onHeight,
}: ClosureReportBarProps) {
  const hasSelection = selectedCount > 0;
  const instruction = hasSelection
    ? "Toca otro tramo para sumarlo, o uno marcado en rojo para quitarlo."
    : "Toca un sendero, pasillo o vía del mapa para marcarlo en rojo.";

  return (
    <>
      <View
        className="absolute left-4 right-4 z-30 flex-row items-center rounded-full bg-white py-2 pl-2 pr-2 shadow-[0_12px_28px_rgba(17,17,17,0.18)] dark:bg-[#141b25] dark:shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
        style={{ top }}
      >
        <View className="size-9 items-center justify-center rounded-full bg-[#b42318] dark:bg-[#d92d20]">
          <Icon name="block" size={18} colorClassName="accent-white" />
        </View>
        <View className="ml-2.5 min-w-0 flex-1">
          <Text className="text-[14px] font-bold leading-4.5 text-[#111111] dark:text-[#f2f4f7]" numberOfLines={1}>
            Reportando vía cerrada
          </Text>
          <Text className="font-sans text-[11px] leading-3.5 text-[#8e8e93] dark:text-[#8b95a5]" numberOfLines={1}>
            Paso 1 de 2 · Elige los tramos en el mapa
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Salir del modo reporte"
          onPress={onCancel}
          hitSlop={6}
          className="size-9 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#212a37]"
        >
          <Icon name="close" size={18} colorClassName="accent-[#3a3a3c] dark:accent-[#c5ccd6]" />
        </Pressable>
      </View>

      <View
        className="absolute left-4 right-4 z-30 rounded-3xl bg-white px-4 pb-4 pt-3.5 shadow-[0_12px_28px_rgba(17,17,17,0.2)] dark:bg-[#141b25] dark:shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
        style={{ bottom }}
        onLayout={(event) => onHeight?.(Math.round(event.nativeEvent.layout.height) + bottom)}
      >
        <View className="flex-row items-center">
          <Text className="min-w-0 flex-1 text-[16px] font-bold text-[#111111] dark:text-[#f2f4f7]" numberOfLines={1}>
            {hasSelection
              ? selectedCount === 1
                ? "1 tramo elegido"
                : `${selectedCount} tramos elegidos`
              : "Toca la vía cerrada"}
          </Text>
          <View className="ml-2 rounded-full bg-[#f2f2f4] px-2 py-0.5 dark:bg-[#212a37]">
            <Text className="text-[11px] font-bold text-[#6e6e73] dark:text-[#8b95a5]">
              {selectedCount}/{maxSegments}
            </Text>
          </View>
        </View>

        {placeLabel ? (
          <View className="mt-1.5 flex-row items-center">
            <Icon name="place" size={14} colorClassName="accent-[#b42318] dark:accent-[#ff9b93]" />
            <Text className="ml-1 min-w-0 flex-1 font-sans text-[12px] text-[#6e6e73] dark:text-[#8b95a5]" numberOfLines={1}>
              {placeLabel}
            </Text>
          </View>
        ) : null}

        <View
          className={`mt-2.5 flex-row items-start rounded-2xl px-3 py-2.5 ${
            hint ? "bg-[#fff7e6] dark:bg-[#2a2213]" : "bg-[#f5f5f7] dark:bg-[#18202a]"
          }`}
        >
          <Icon
            name={hint ? "info-outline" : "touch-app"}
            size={16}
            colorClassName={
              hint ? "accent-[#9a5b00] dark:accent-[#f5c46b]" : "accent-[#6e6e73] dark:accent-[#8b95a5]"
            }
          />
          <Text
            className={`ml-2 min-w-0 flex-1 font-sans text-[12px] leading-4.5 ${
              hint ? "text-[#9a5b00] dark:text-[#f5c46b]" : "text-[#6e6e73] dark:text-[#8b95a5]"
            }`}
          >
            {hint ?? instruction}
          </Text>
        </View>

        {hasSelection ? (
          <View className="mt-2.5 flex-row">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Deshacer último tramo"
              onPress={onUndo}
              className="h-9 flex-row items-center rounded-full px-3 active:opacity-70"
            >
              <Icon name="undo" size={16} colorClassName="accent-[#6e6e73] dark:accent-[#8b95a5]" />
              <Text className="ml-1.5 text-[13px] font-semibold text-[#6e6e73] dark:text-[#8b95a5]">Deshacer</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar todos los tramos"
              onPress={onClear}
              className="h-9 flex-row items-center rounded-full px-3 active:opacity-70"
            >
              <Icon name="delete-outline" size={16} colorClassName="accent-[#6e6e73] dark:accent-[#8b95a5]" />
              <Text className="ml-1.5 text-[13px] font-semibold text-[#6e6e73] dark:text-[#8b95a5]">Limpiar</Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mt-3 flex-row">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar reporte"
            onPress={onCancel}
            className="h-12 flex-1 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#212a37]"
          >
            <Text className="text-[14px] font-bold text-[#3a3a3c] dark:text-[#c5ccd6]">Cancelar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasSelection ? "Continuar: describir el cierre" : "Continuar (elige al menos un tramo)"}
            accessibilityState={{ disabled: !hasSelection }}
            disabled={!hasSelection}
            onPress={onContinue}
            className={`ml-2 h-12 flex-[1.4] flex-row items-center justify-center rounded-full bg-[#b42318] active:opacity-80 dark:bg-[#d92d20] ${
              hasSelection ? "" : "opacity-30"
            }`}
          >
            <Text className="text-[14px] font-bold text-white">Continuar</Text>
            <Icon name="arrow-forward" size={17} colorClassName="accent-white" />
          </Pressable>
        </View>
      </View>
    </>
  );
}

/** Tiempo que el aviso permanece visible antes de descartarse solo, como tocar la ✕. */
const PROMPT_AUTO_DISMISS_MS = 10_000;

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
  const [exiting, setExiting] = useState(false);
  const dismissedRef = useRef(false);
  const deliveredRef = useRef(false);
  const [progressAnim] = useState(() => new Animated.Value(1));
  const progressValueRef = useRef(1);
  const [presenceAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);

  // Entrada suave: sube desde abajo y aparece, sin montarse de golpe.
  useEffect(() => {
    const animation = Animated.spring(presenceAnim, {
      toValue: 1,
      damping: 26,
      stiffness: 260,
      mass: 0.85,
      overshootClamping: true,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [presenceAnim]);

  const presenceStyle = {
    opacity: presenceAnim,
    transform: [
      { translateY: presenceAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
      { scale: presenceAnim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
    ],
  };

  const deliverDismiss = useCallback(() => {
    if (deliveredRef.current) return;
    deliveredRef.current = true;
    onDismiss();
  }, [onDismiss]);

  // Salida suave y recién entonces avisar al padre. El timeout es respaldo
  // por si la animación se cancela antes de terminar.
  const dismissOnce = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setExiting(true);
    progressAnim.stopAnimation();
    Animated.timing(presenceAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) deliverDismiss();
    });
    setTimeout(deliverDismiss, 260);
  }, [deliverDismiss, presenceAnim, progressAnim]);

  // Cuenta regresiva del auto-cierre, animada por frames (fluida, sin
  // re-renders). Se pausa mientras se guarda un voto o hay un error en
  // pantalla, para no cerrar el aviso en mitad de la lectura.
  useEffect(() => {
    if (busy != null || error || exiting) {
      progressAnim.stopAnimation();
      return;
    }
    const animation = Animated.timing(progressAnim, {
      toValue: 0,
      duration: Math.max(0, progressValueRef.current * PROMPT_AUTO_DISMISS_MS),
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) dismissOnce();
    });
    return () => animation.stop();
  }, [busy, error, exiting, dismissOnce, progressAnim]);

  const progressStyle = {
    width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
  };

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

  const confirmed = closure.status === "confirmed";

  return (
    <Animated.View
      style={[{ position: "absolute", left: 16, right: 16, zIndex: 30, bottom }, presenceStyle]}
      accessibilityRole="alert"
    >
      <View className="rounded-3xl bg-white px-3.5 pb-5 pt-3.5 shadow-[0_12px_28px_rgba(17,17,17,0.2)] dark:bg-[#141b25] dark:shadow-[0_12px_28px_rgba(0,0,0,0.55)]">
      <View className="flex-row items-center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver detalle del cierre"
          onPress={onOpen}
          className="min-w-0 flex-1 active:opacity-80"
        >
          <View className="flex-row items-center">
            <View
              className={`size-11 items-center justify-center rounded-full ${
                confirmed ? "bg-[#fdecec] dark:bg-[#2a1517]" : "bg-[#fff7e6] dark:bg-[#2a2213]"
              }`}
            >
              <Icon
                name="block"
                size={22}
                colorClassName={
                  confirmed ? "accent-[#b42318] dark:accent-[#ff9b93]" : "accent-[#9a5b00] dark:accent-[#f5c46b]"
                }
              />
            </View>
            <View className="ml-2.5 min-w-0 flex-1">
              <Text className="text-[17px] font-extrabold leading-5 tracking-tight text-[#111111] dark:text-[#f2f4f7]" numberOfLines={1}>
                Vía cerrada a {formatDistance(distanceM)}
              </Text>
              <Text className="font-sans text-[12px] leading-4 text-[#8e8e93] dark:text-[#8b95a5]" numberOfLines={1}>
                {categoryLabel(closure.category)} · {closure.description}
              </Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ahora no, cerrar aviso"
          disabled={busy != null || exiting}
          onPress={dismissOnce}
          hitSlop={8}
          className="ml-1 size-7 items-center justify-center active:opacity-60"
        >
          <Icon name="close" size={16} colorClassName="accent-[#a1a1a6] dark:accent-[#6b7584]" />
        </Pressable>
      </View>

      {simulated || error ? (
        <Text
          className={`mt-1.5 font-sans text-[11px] leading-4 ${
            error ? "text-[#b42318] dark:text-[#ff9b93]" : "text-[#a1a1a6] dark:text-[#6b7584]"
          }`}
          numberOfLines={1}
        >
          {error ?? "Modo prueba: validando como si estuvieras aquí"}
        </Text>
      ) : null}

      <View className="mt-3 flex-row">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ya está abierta"
          accessibilityState={{ busy: busy === "now_open", disabled: busy != null }}
          disabled={busy != null || exiting}
          onPress={() => {
            void vote("now_open");
          }}
          className="h-11 flex-1 flex-row items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#212a37]"
        >
          {busy === "now_open" ? (
            <ActivityIndicator size="small" colorClassName="accent-[#111111] dark:accent-[#f2f4f7]" />
          ) : (
            <>
              <Icon name="check-circle-outline" size={18} colorClassName="accent-[#1f6b3a] dark:accent-[#6fce8f]" />
              <Text className="ml-1.5 text-[13px] font-bold text-[#111111] dark:text-[#f2f4f7]">Ya está abierta</Text>
            </>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sigue cerrada"
          accessibilityState={{ busy: busy === "still_closed", disabled: busy != null }}
          disabled={busy != null || exiting}
          onPress={() => {
            void vote("still_closed");
          }}
          className="ml-2 h-11 flex-1 flex-row items-center justify-center rounded-full bg-[#b42318] active:opacity-80 dark:bg-[#d92d20]"
        >
          {busy === "still_closed" ? (
            <ActivityIndicator size="small" colorClassName="accent-white" />
          ) : (
            <>
              <Icon name="block" size={17} colorClassName="accent-white" />
              <Text className="ml-1.5 text-[13px] font-bold text-white">Sigue cerrada</Text>
            </>
          )}
        </Pressable>
      </View>

      <View
        className="absolute bottom-1.5 left-4 right-4 h-0.75 overflow-hidden rounded-full bg-[#111111]/5 dark:bg-white/10"
        accessibilityRole="progressbar"
        accessibilityLabel="Tiempo para que este aviso se cierre solo"
      >
        <Animated.View
          className={`h-full rounded-full ${confirmed ? "bg-[#b42318] dark:bg-[#ff9b93]" : "bg-[#d97706] dark:bg-[#f5c46b]"}`}
          style={progressStyle}
        />
      </View>
      </View>
    </Animated.View>
  );
}
