import { SLIP_FLAGS, SLIP_MAX_BYTES, SLIP_STATUSES } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { dictionaries } from "./i18n/dictionary";
import { canConfirmSlip, isOpenSlip, slipFlagKey, validateSlipFile } from "./slips";
import type { SlipDto } from "./types";

const slip = (patch: Partial<SlipDto> = {}): SlipDto => ({
  id: "s1", orderId: "o1", conversationId: null, messageId: null, attachmentIndex: null, source: "UPLOAD",
  status: "READ", imageMime: "image/png", imageBytes: 1, readerName: "fake", readerVersion: "1",
  read: { amount: "100.00", currency: "LAK", paidAt: null, destAccount: null, refNo: "R1" },
  confirmed: { amount: null, currency: null, paidAt: null, destAccount: null, refNo: null },
  flags: [], reviewedBy: null, reviewedAt: null, rejectReason: null, createdAt: "2026-10-07T00:00:00.000Z",
  ...patch,
});

describe("validateSlipFile", () => {
  it("ຜ່ານ jpeg/png/webp ທີ່ບໍ່ໃຫຍ່ເກີນ", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(validateSlipFile({ type, size: 10 })).toBeNull();
    expect(validateSlipFile({ type: "image/png", size: SLIP_MAX_BYTES })).toBeNull();
  });
  it("ປະຕິເສດຊະນິດອື່ນ ແລະ ຂະໜາດເກີນ/ໄຟລ໌ວ່າງ", () => {
    expect(validateSlipFile({ type: "image/gif", size: 10 })).toBe("type");
    expect(validateSlipFile({ type: "application/pdf", size: 10 })).toBe("type");
    expect(validateSlipFile({ type: "image/png", size: SLIP_MAX_BYTES + 1 })).toBe("size");
    expect(validateSlipFile({ type: "image/png", size: 0 })).toBe("size");
  });
});

describe("isOpenSlip / canConfirmSlip", () => {
  it("open = ຍັງບໍ່ຢືນຢັນ/ປະຕິເສດ", () => {
    for (const status of SLIP_STATUSES) expect(isOpenSlip(slip({ status }))).toBe(["PENDING_READ", "READ", "READ_FAILED"].includes(status));
  });
  it("ຢືນຢັນໄດ້ເມື່ອ READ/READ_FAILED + ຜູກບິນ + ມີສິດ; PENDING_READ/ບໍ່ຜູກ/ບໍ່ມີສິດ ບໍ່ໄດ້", () => {
    expect(canConfirmSlip(slip(), true)).toBe(true);
    expect(canConfirmSlip(slip({ status: "READ_FAILED" }), true)).toBe(true);
    expect(canConfirmSlip(slip({ status: "PENDING_READ" }), true)).toBe(false);
    expect(canConfirmSlip(slip({ orderId: null }), true)).toBe(false);
    expect(canConfirmSlip(slip(), false)).toBe(false);
    expect(canConfirmSlip(slip({ status: "CONFIRMED" }), true)).toBe(false);
  });
});

describe("slipFlagKey", () => {
  it("ທຸກ flag ທີ່ API ອາດສົ່ງ ມີຂໍ້ຄວາມທັງ lo ແລະ en; ຄ່າທີ່ບໍ່ຮູ້ຈັກ → UNKNOWN", () => {
    for (const flag of SLIP_FLAGS) {
      const key = slipFlagKey(flag);
      expect(dictionaries.lo[key], key).toBeTruthy();
      expect(dictionaries.en[key], key).toBeTruthy();
    }
    expect(slipFlagKey("NEW_FLAG_FROM_FUTURE")).toBe("slips.flag.UNKNOWN");
  });
});
