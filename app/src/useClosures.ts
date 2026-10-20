import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  cachedClosures,
  fetchActiveClosures,
  fetchMyVotes,
  reportClosure,
  voteClosure,
  type ActiveClosure,
  type ClosureVote,
  type ReportInput,
} from "@/closures";
import { supabase } from "@/supabase";

const REFRESH_EVERY_MS = 60_000;

/** Cierres vivos y votos propios. Se refresca al abrir, por Realtime, cada minuto y al volver a la app. */
export function useCampusClosures(userId: string | null) {
  const [closures, setClosures] = useState<ActiveClosure[]>([]);
  const [myVotes, setMyVotes] = useState<Map<number, ClosureVote>>(new Map());
  const requestRef = useRef(0);

  const refresh = useCallback(
    async (force = false) => {
      const requestId = ++requestRef.current;
      try {
        const [fresh, votes] = await Promise.all([
          fetchActiveClosures(userId, { force }),
          userId ? fetchMyVotes(userId) : Promise.resolve(new Map<number, ClosureVote>()),
        ]);
        if (requestId !== requestRef.current) return;
        setClosures(fresh);
        setMyVotes(votes);
      } catch {
        // Sin red se quedan los últimos cierres conocidos.
      }
    },
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    void cachedClosures(userId).then((cached) => {
      if (cancelled) return;
      if (cached) setClosures(cached);
      void refresh();
    });
    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_EVERY_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });

    // El aviso no trae datos: solo dispara una lectura nueva. Así una
    // reapertura quita el tramo rojo aunque la fila ya no sea visible por RLS.
    let realtimeTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRealtimeRefresh = () => {
      if (realtimeTimer) clearTimeout(realtimeTimer);
      realtimeTimer = setTimeout(() => {
        realtimeTimer = null;
        void refresh(true);
      }, 350);
    };
    const channel = supabase
      ? supabase
          .channel("campus-closures", { config: { private: true } })
          .on("broadcast", { event: "closures_changed" }, scheduleRealtimeRefresh)
          .subscribe()
      : null;

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (realtimeTimer) clearTimeout(realtimeTimer);
      subscription.remove();
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const report = useCallback(
    async (input: ReportInput) => {
      const id = await reportClosure(input);
      await refresh(true);
      return id;
    },
    [refresh],
  );

  const vote = useCallback(
    async (
      closureId: number,
      choice: ClosureVote,
      onSite: boolean,
      positionSource: "simulated" | "gps",
    ) => {
      if (!userId) throw new Error("Inicia sesión para validar cierres.");
      await voteClosure(closureId, userId, choice, onSite, positionSource);
      setMyVotes((current) => new Map(current).set(closureId, choice));
      await refresh(true);
    },
    [userId, refresh],
  );

  return { closures, myVotes, refresh, report, vote };
}
