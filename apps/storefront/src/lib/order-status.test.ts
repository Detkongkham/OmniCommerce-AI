import { describe, expect, it } from "vitest";
import { ORDER_STEPS, orderStatusLabel, orderStepIndex } from "./order-status";

describe("order status", () => {
  it("ຂັ້ນຕອນ 4 ຂັ້ນຕາມລຳດັບ", () => {
    expect(ORDER_STEPS.map((step) => step.label)).toEqual(["ລໍຖ້າຊຳລະ", "ຊຳລະແລ້ວ", "ກຳລັງແພັກ", "ສົ່ງແລ້ວ"]);
  });

  it("orderStepIndex: ຕຳແໜ່ງຂອງສະຖານະ; COMPLETED ຢູ່ຂັ້ນສຸດທ້າຍ; ຍົກເລີກ/ໝົດອາຍຸ = -1", () => {
    expect(orderStepIndex("PENDING_PAYMENT")).toBe(0);
    expect(orderStepIndex("PAID")).toBe(1);
    expect(orderStepIndex("PACKING")).toBe(2);
    expect(orderStepIndex("SHIPPED")).toBe(3);
    expect(orderStepIndex("COMPLETED")).toBe(3);
    expect(orderStepIndex("CANCELLED")).toBe(-1);
    expect(orderStepIndex("EXPIRED")).toBe(-1);
  });

  it("ທຸກສະຖານະມີປ້າຍພາສາລາວ ແລະ ໂທນສີ", () => {
    expect(orderStatusLabel("PENDING_PAYMENT")).toEqual({ label: "ລໍຖ້າຊຳລະ", tone: "warning" });
    expect(orderStatusLabel("COMPLETED")).toEqual({ label: "ສຳເລັດ", tone: "success" });
    expect(orderStatusLabel("EXPIRED")).toEqual({ label: "ໝົດເວລາຊຳລະ", tone: "neutral" });
    expect(orderStatusLabel("CANCELLED")).toEqual({ label: "ຍົກເລີກແລ້ວ", tone: "danger" });
  });
});
