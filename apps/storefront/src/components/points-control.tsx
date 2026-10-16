"use client";

import { Button, Input } from "@oca/ui";
import Link from "next/link";
import { formatLak, formatPoints } from "@/lib/format";
import { pointsValue } from "@/lib/member";
import type { StoreCart, StoreLoyalty, StoreMember } from "@/lib/types";

/** ຄ່າໃນຊ່ອງແຕ້ມ → ຈຳນວນເຕັມ >= 0 (ວ່າງ/ຜິດ = 0) */
export function parsePoints(raw: string): number {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** info = ປັບຄ່າໃຫ້ແລ້ວ (ບໍ່ແມ່ນ error); error = ໃຊ້ແຕ້ມບໍ່ໄດ້ */
export type PointsNotice = { tone: "info" | "error"; text: string };

/** ແຕ້ມຖືກປັດລົງເປັນສູງສຸດຂອງບິນ */
export function clampNotice(points: number): PointsNotice {
  return { tone: "info", text: `ປັບເປັນ ${formatPoints(points)} (ສູງສຸດຂອງບິນນີ້)` };
}

interface PointsControlProps {
  member: StoreMember | null | undefined;
  loyalty: StoreLoyalty;
  points: StoreCart["points"];
  phoneMatches: boolean;
  sessionExpired: boolean;
  input: string;
  onInput: (value: string) => void;
  /** ຜູ້ເອີ້ນປັດໃຫ້ຢູ່ໃນ 0..maxPoints */
  onApply: (points: number) => void;
  /** ເຫດຜົນທີ່ແຕ້ມຖືກປັບ/ປະຕິເສດຫຼ້າສຸດ */
  notice: PointsNotice | null;
  /** ຄ່າທີ່ໃຊ້ຢູ່ (ປຸ່ມ "ໃຊ້" ປິດເມື່ອຊ່ອງກົງກັບຄ່ານີ້) */
  appliedPoints: number;
  /** ພິມແລ້ວແຕ່ຍັງບໍ່ກົດ "ໃຊ້" (ຫຼື server ຍັງບໍ່ຢືນຢັນ) */
  pending: boolean;
}

/** "ໃຊ້ແຕ້ມ": ສະເພາະສະມາຊິກທີ່ມີແຕ້ມໃຊ້ໄດ້ໃນບິນນີ້; guest ເຫັນຄຳແນະນຳໃຫ້ເຂົ້າລະບົບ */
export function PointsControl({ member, loyalty, points, phoneMatches, sessionExpired, input, onInput, onApply, notice, appliedPoints, pending }: PointsControlProps) {
  if (!loyalty.enabled) return null;
  if (!member) {
    if (member === undefined) return null;
    return (
      <p className="border-t border-line pt-3 text-xs text-ink-secondary">
        {sessionExpired ? "ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່ ເພື່ອໃຊ້ແຕ້ມ " : "ມີບັນຊີ? "}
        <Link href="/account" className="font-semibold text-brand-ink underline underline-offset-4">
          ເຂົ້າສູ່ລະບົບເພື່ອໃຊ້ແຕ້ມ
        </Link>
      </p>
    );
  }
  if (!points || (points.maxPoints <= 0 && points.redeemed <= 0)) return null;

  const disabled = !phoneMatches;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <label htmlFor="checkout-points" className="text-xs font-semibold text-ink-secondary">
        ໃຊ້ແຕ້ມ
      </label>
      <p id="checkout-points-help" className="text-xs text-ink-secondary">
        {`ມີ ${formatPoints(points.balance)} · ບິນນີ້ໃຊ້ໄດ້ສູງສຸດ ${formatPoints(points.maxPoints)} (${formatLak(pointsValue(points.maxPoints, loyalty.pointValue))})`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          id="checkout-points"
          className="h-10 min-w-0 flex-1 basis-24"
          type="number"
          inputMode="numeric"
          min={0}
          max={points.maxPoints}
          step={1}
          disabled={disabled}
          aria-describedby="checkout-points-help checkout-points-status"
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter ໃນຊ່ອງແຕ້ມ = ໃຊ້ແຕ້ມ ບໍ່ແມ່ນສົ່ງຄຳສັ່ງຊື້
            if (event.key === "Enter") {
              event.preventDefault();
              onApply(parsePoints(input));
            }
          }}
        />
        <Button type="button" variant="outlinePrimary" className="h-10 shrink-0 rounded-xl" aria-label="ໃຊ້ແຕ້ມ" disabled={disabled || parsePoints(input) === appliedPoints} onClick={() => onApply(parsePoints(input))}>
          ໃຊ້
        </Button>
        <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl" disabled={disabled || points.maxPoints <= 0} onClick={() => onApply(points.maxPoints)}>
          ໃຊ້ສູງສຸດ
        </Button>
      </div>
      {disabled ? <p className="text-xs text-warning-ink">{`ໃຊ້ແຕ້ມໄດ້ສະເພາະເມື່ອເບີໂທຜູ້ຮັບແມ່ນ ${member.phone ?? "ເບີຂອງບັນຊີ"}`}</p> : null}
      {/* ຢູ່ຕະຫຼອດ ເພື່ອໃຫ້ screen reader ອ່ານຂໍ້ຄວາມທີ່ປ່ຽນ */}
      <div id="checkout-points-status" aria-live="polite" className="flex flex-col gap-1 text-xs font-semibold">
        {!disabled && notice ? <p className={notice.tone === "error" ? "text-danger-ink" : "font-normal text-warning-ink"}>{notice.text}</p> : null}
        {!disabled && pending ? <p className="text-warning-ink">ກົດ ໃຊ້ ເພື່ອຢືນຢັນແຕ້ມ</p> : null}
      </div>
      {points.redeemed > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-success-ink">
          <span>{`ໃຊ້ແຕ້ມ (${formatPoints(points.redeemed)})`}</span>
          <span className="flex items-center gap-2">
            <span>{`−${formatLak(points.discount)}`}</span>
            <button
              type="button"
              aria-label="ລຶບແຕ້ມທີ່ໃຊ້"
              className="rounded-md px-1 text-xs text-ink-secondary underline underline-offset-4 hover:text-danger-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onApply(0)}
            >
              ລຶບ
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
