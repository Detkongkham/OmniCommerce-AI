"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { API_BASE, getAccessToken, refreshSession } from "./api";
import { type StreamStatus, runInboxStream } from "./inbox-stream";
import { queryKeys } from "./queries";

/** ລວມ event ທີ່ມາຕິດໆກັນເປັນການ refetch ຄັ້ງດຽວ */
const COALESCE_MS = 250;
/** poll ສຳຮອງ (spec §6): ກັນກໍລະນີ SSE ຂາດ/ຖືກ proxy ຕັດ */
export const POLL_MS = 60_000;

/**
 * ຮັບ event ສົດຂອງ inbox ແລ້ວ invalidate ທຸກ query ຂອງ conversations (ລາຍການ, ລາຍລະອຽດ, ຂໍ້ຄວາມ).
 * ຄືນສະຖານະການເຊື່ອມຕໍ່ ເພື່ອສະແດງໃຫ້ຜູ້ໃຊ້.
 */
export function useInboxRealtime(enabled = true): StreamStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>("connecting");

  useEffect(() => {
    if (!enabled) return;
    setStatus("connecting");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    };
    const scheduleRefetch = () => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      timer = setTimeout(refetch, COALESCE_MS);
    };

    void runInboxStream({
      url: `${API_BASE}/inbox/events`,
      getToken: getAccessToken,
      refresh: async () => (await refreshSession())?.accessToken ?? null,
      onStatus: setStatus,
      onChange: scheduleRefetch,
      signal: controller.signal,
    }).catch(() => undefined);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, POLL_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [enabled, queryClient]);

  return status;
}
