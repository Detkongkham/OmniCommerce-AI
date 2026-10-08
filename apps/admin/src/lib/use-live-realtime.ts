"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { API_BASE, getAccessToken, refreshSession } from "./api";
import { type StreamStatus, runEventStream } from "./event-stream";
import { queryKeys } from "./queries";

/** ລວມ event ທີ່ມາຕິດໆກັນ (CF ຫຼາຍຄອມເມັ້ນ) ເປັນການ refetch ຄັ້ງດຽວ */
const COALESCE_MS = 250;

/**
 * ຮັບ `live.updated` ຂອງ session ແລ້ວ invalidate ທຸກ query ຂອງ session ນັ້ນ (detail, host, comments) ແລະ ລາຍການ session.
 * ຜູ້ໃຊ້ hook ຄວນ poll ສຳຮອງເມື່ອ status ບໍ່ແມ່ນ "connected".
 */
export function useLiveRealtime(sessionId: string, enabled = true): StreamStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>(enabled ? "connecting" : "disconnected");

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }
    setStatus("connecting");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const [root, kind, id] = query.queryKey as unknown[];
          return root === queryKeys.liveSessions[0] && (kind === "list" || id === sessionId);
        },
      });
    };
    const scheduleRefetch = () => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      timer = setTimeout(refetch, COALESCE_MS);
    };

    void runEventStream({
      url: `${API_BASE}/live-sessions/${encodeURIComponent(sessionId)}/events`,
      events: ["live.updated"],
      getToken: getAccessToken,
      refresh: async () => (await refreshSession())?.accessToken ?? null,
      onStatus: setStatus,
      onChange: scheduleRefetch,
      signal: controller.signal,
    }).catch(() => undefined);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [enabled, sessionId, queryClient]);

  return status;
}
