"use client";

import { SLIP_MAX_BYTES } from "@oca/shared";
import { buttonVariants, cn } from "@oca/ui";
import { LoaderCircle, Upload } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { ClientApiError, uploadSlip } from "@/lib/client-api";
import { apiMessage } from "@/lib/messages";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const INVALID_FILE = "ໄຟລ໌ຕ້ອງເປັນຮູບ JPEG, PNG ຫຼື WebP ແລະ ບໍ່ເກີນ 8 MB";

interface SlipUploadProps {
  token: string;
  /** ເອີ້ນຫຼັງ server ຮັບສະລິບ (ໃຫ້ໜ້າບິນໂຫຼດສະຖານະໃໝ່) */
  onUploaded: () => void;
  /** ປ້າຍຂອງປຸ່ມ (ເຊັ່ນ "ອັບໂຫຼດສະລິບໃໝ່" ຫຼັງຖືກປະຕິເສດ) */
  label?: string;
}

/** ປຸ່ມເລືອກຮູບສະລິບ: ກວດຊະນິດ/ຂະໜາດກ່ອນ ແລ້ວອັບໂຫຼດທັນທີ */
export function SlipUpload({ token, onUploaded, label = "ອັບໂຫຼດສະລິບ" }: SlipUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // ລ້າງຄ່າ ເພື່ອໃຫ້ເລືອກໄຟລ໌ເດີມຊ້ຳໄດ້ຫຼັງ error
    event.target.value = "";
    if (!file) return;
    setSent(false);
    if (!ACCEPT.includes(file.type) || file.size > SLIP_MAX_BYTES || file.size === 0) {
      setError(INVALID_FILE);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await uploadSlip(token, file);
      setSent(true);
      onUploaded();
    } catch (caught) {
      setError(apiMessage(caught instanceof ClientApiError ? caught.code : undefined, "ອັບໂຫຼດບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        className={cn(
          buttonVariants({ size: "lg" }),
          "h-11 cursor-pointer rounded-xl focus-within:ring-2 focus-within:ring-ring",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
        <span>{uploading ? "ກຳລັງອັບໂຫຼດ…" : label}</span>
        <input type="file" accept={ACCEPT.join(",")} aria-label="ເລືອກຮູບສະລິບ" className="sr-only" disabled={uploading} onChange={onChange} />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {sent && !error ? (
        <p role="status" className="text-sm text-success-ink">
          ສົ່ງສະລິບແລ້ວ ຮ້ານຈະກວດສອບ ແລະ ຢືນຢັນໃຫ້
        </p>
      ) : null}
    </div>
  );
}
