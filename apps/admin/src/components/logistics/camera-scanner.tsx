"use client";

import { Button } from "@oca/ui";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/language-provider";

/** ລະຫັດດຽວກັນທີ່ກ້ອງເຫັນຊ້ຳພາຍໃນເວລານີ້ ນັບເທື່ອດຽວ (ກ້ອງອ່ານໄດ້ຫຼາຍເທື່ອຕໍ່ວິນາທີ) */
const REPEAT_MS = 1500;
const DETECT_INTERVAL_MS = 250;

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/**
 * ສະແກນບາໂຄດດ້ວຍກ້ອງ: BarcodeDetector ຂອງ browser ຖ້າມີ (Chrome Android/desktop),
 * ບໍ່ດັ່ງນັ້ນໂຫຼດ @zxing/browser ຕອນເປີດ (Safari/iOS). ປິດ = ຢຸດກ້ອງທັນທີ.
 */
export function CameraScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(onDetected);
  detectedRef.current = onDetected;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopZxing: (() => void) | undefined;
    let last = { code: "", at: 0 };
    const emit = (code: string) => {
      const now = Date.now();
      if (code === last.code && now - last.at < REPEAT_MS) return;
      last = { code, at: now };
      detectedRef.current(code);
    };

    async function start() {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setError(t("pack.cameraError"));
        return;
      }
      const Detector = (window as unknown as { BarcodeDetector?: new (options?: object) => DetectorLike }).BarcodeDetector;
      try {
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          if (cancelled) return;
          video.srcObject = stream;
          await video.play();
          const detector = new Detector({ formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "qr_code"] });
          timer = setInterval(() => {
            void detector
              .detect(video)
              .then((codes) => {
                const value = codes[0]?.rawValue;
                if (value) emit(value);
              })
              .catch(() => undefined);
          }, DETECT_INTERVAL_MS);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (cancelled) return;
          const controls = await new BrowserMultiFormatReader().decodeFromVideoDevice(undefined, video, (result) => {
            if (result) emit(result.getText());
          });
          stopZxing = () => controls.stop();
          if (cancelled) stopZxing();
        }
      } catch {
        if (!cancelled) setError(t("pack.cameraError"));
      }
    }

    void start();
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopZxing?.();
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [t]);

  return (
    <div className="rounded-xl border border-line bg-subtle p-3">
      <div className="mb-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={onClose}>
          <X aria-hidden="true" />
          {t("pack.cameraClose")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : (
        // ວິດີໂອສົດຈາກກ້ອງ (ບໍ່ມີສຽງ/ຄຳບັນຍາຍ)
        <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />
      )}
    </div>
  );
}
