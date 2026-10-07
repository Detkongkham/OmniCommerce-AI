"use client";

import { MAX_MESSAGE_LENGTH } from "@oca/shared";
import { Button } from "@oca/ui";
import { Send } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { sendErrorKey } from "@/lib/inbox";
import { useSendMessage } from "@/lib/queries";

export interface ComposerProps {
  conversationId: string;
  canWrite: boolean;
  /** ເອີ້ນຫຼັງສົ່ງສຳເລັດ (ບໍ່ແມ່ນ FAILED) */
  onSent?: () => void;
}

export function Composer({ conversationId, canWrite, onSent }: ComposerProps) {
  const { t } = useT();
  const send = useSendMessage();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasPending = useRef(false);
  const inFlight = useRef(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = send.isPending;
  const trimmed = text.trim();

  // ສົ່ງແລ້ວ (ຊ່ອງພິມຖືກປົດລັອກ) ໃຫ້ກັບມາ focus ທີ່ຊ່ອງພິມ ເພື່ອພິມຕໍ່ໄດ້ທັນທີ
  useEffect(() => {
    if (wasPending.current && !pending) {
      // ດຶງ focus ກັບມາສະເພາະເມື່ອຜູ້ໃຊ້ບໍ່ໄດ້ຍ້າຍໄປບ່ອນອື່ນ
      const active = document.activeElement;
      if (!active || active === document.body || active === inputRef.current) inputRef.current?.focus();
    }
    wasPending.current = pending;
  }, [pending]);

  async function submit() {
    if (!canWrite || pending || inFlight.current || trimmed === "") return;
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(t("inbox.composer.tooLong", { max: MAX_MESSAGE_LENGTH }));
      return;
    }
    setError(null);
    inFlight.current = true;
    try {
      const message = await send.mutateAsync({ id: conversationId, input: { text: trimmed } });
      // API ບັນທຶກແຖວ FAILED ແລ້ວ (ຢູ່ໃນ thread) ແຕ່ຄືນ 201: ເກັບຂໍ້ຄວາມໃນຊ່ອງໄວ້ໃຫ້ແກ້/ສົ່ງໃໝ່
      if (message.status === "FAILED") {
        setError(t("inbox.composer.failedKept", { reason: t(sendErrorKey(message.errorCode)) }));
      } else {
        setText("");
        onSent?.();
      }
    } catch (caught) {
      setError(errorMessage(caught, t));
    } finally {
      inFlight.current = false;
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // ກຳລັງ compose ດ້ວຍ IME (ລາວ/CJK): Enter ເປັນຂອງ IME (keyCode 229 ສຳລັບ Safari)
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submit();
  }

  if (!canWrite) {
    return <p className="border-t border-line bg-subtle px-4 py-3 text-sm text-ink-secondary">{t("inbox.composer.readOnly")}</p>;
  }

  return (
    <form
      className="border-t border-line bg-surface p-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <p role="alert" className="mb-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          aria-label={t("inbox.composer.label")}
          placeholder={t("inbox.composer.placeholder")}
          rows={2}
          value={text}
          disabled={pending}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          className="min-h-[3.25rem] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
        />
        <Button type="submit" className="h-10 rounded-xl px-4" disabled={trimmed === ""} loading={pending}>
          {pending ? null : <Send aria-hidden="true" />}
          {pending ? t("inbox.composer.sending") : t("inbox.composer.send")}
        </Button>
      </div>
    </form>
  );
}
