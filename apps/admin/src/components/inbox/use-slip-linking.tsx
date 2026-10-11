"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConversationSlips } from "@/lib/queries";
import { LinkSlipDialog, type LinkSlipTarget } from "./link-slip-dialog";

/**
 * ການຜູກຮູບໃນແຊັດເປັນສະລິບຂອງ 1 ເຄສ: ສະຖານະ dialog + index ຂອງຮູບທີ່ຜູກແລ້ວ.
 * canLinkSlip=false → ບໍ່ດຶງ slips ຂອງເຄສ ແລະ ບໍ່ມີ dialog.
 */
export function useSlipLinking(conversationId: string, canLinkSlip: boolean) {
  const slips = useConversationSlips(conversationId, { enabled: canLinkSlip });
  const [target, setTarget] = useState<LinkSlipTarget | null>(null);
  const openerKey = useRef<string | null>(null);

  // messageId → index ຂອງຮູບທີ່ຜູກເປັນສະລິບແລ້ວ
  const linkedByMessage = useMemo(() => {
    const map = new Map<string, Set<number>>();
    if (!canLinkSlip) return map;
    for (const slip of slips.data ?? []) {
      if (!slip.messageId || slip.attachmentIndex === null) continue;
      const set = map.get(slip.messageId) ?? new Set<number>();
      set.add(slip.attachmentIndex);
      map.set(slip.messageId, set);
    }
    return map;
  }, [canLinkSlip, slips.data]);

  // ປ່ຽນເຄສ ຫຼື ເສຍສິດ → ປິດ dialog
  useEffect(() => {
    setTarget(null);
  }, [conversationId, canLinkSlip]);

  function openFor(messageId: string, attachmentIndex: number) {
    openerKey.current = `${messageId}:${attachmentIndex}`;
    setTarget({ conversationId, messageId, attachmentIndex });
  }

  /** ຄືນ focus ຫຼັງປິດ: ປຸ່ມ "ໃຊ້ເປັນສະລິບ" ເດີມ ຖ້າຍັງຢູ່; ບໍ່ດັ່ງນັ້ນ (ຜູກແລ້ວ ປຸ່ມຫາຍ) ໄປທີ່ fallback (ໜ້າຕ່າງຂໍ້ຄວາມ) */
  function restoreFocus(fallback: HTMLElement | null) {
    const key = openerKey.current;
    // ປຽບທຽບຄ່າ attribute ໂດຍກົງ (id ຂອງຂໍ້ຄວາມບໍ່ຖືກໃສ່ໃນ CSS selector)
    const opener = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-slip-opener]")).find(
      (element) => element.dataset.slipOpener === key,
    );
    if (opener?.isConnected && !opener.disabled) opener.focus();
    else fallback?.focus();
  }

  function dialog(fallback: () => HTMLElement | null) {
    if (!canLinkSlip) return null;
    return <LinkSlipDialog target={target} onClose={() => setTarget(null)} restoreFocus={() => restoreFocus(fallback())} />;
  }

  return { linkedByMessage, openFor, dialog };
}
