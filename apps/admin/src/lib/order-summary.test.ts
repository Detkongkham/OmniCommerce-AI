import { MAX_MESSAGE_LENGTH } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { type OrderSummarySource, buildOrderSummary } from "./order-summary";

const order = (patch: Partial<OrderSummarySource> = {}): OrderSummarySource => ({
  orderNumber: "SO-000001",
  currency: "LAK",
  status: "PENDING_PAYMENT",
  items: [
    { productName: "Tee", variantName: "Red", quantity: 2, unitPrice: "100.00", discount: "10.00", lineTotal: "190.00" },
    { productName: "Mug", variantName: null, quantity: 1, unitPrice: "50.00", discount: "0.00", lineTotal: "50.00" },
  ],
  shippingFee: "5.00",
  total: "245.00",
  // 2026-10-05T06:00Z = 13:00 ເວລາລາວ (UTC+7)
  reservedUntil: "2026-10-05T06:00:00.000Z",
  ...patch,
});

describe("buildOrderSummary", () => {
  it("ເລກບິນ, ລາຍການ (ຊື່ + ແບບ, ຈຳນວນ x ລາຄາ = ລວມແຖວ, ສ່ວນຫຼຸດ), ຄ່າສົ່ງ, ຍອດ ແລະ ເວລາຈອງ", () => {
    expect(buildOrderSummary(order())).toBe(
      [
        "ສະຫຼຸບບິນຂອງທ່ານ",
        "ເລກທີ SO-000001",
        "",
        "1. Tee (Red) 2 x 100.00 = 190.00 (ຫຼັງຫັກສ່ວນຫຼຸດ 10.00)",
        "2. Mug 1 x 50.00 = 50.00",
        "",
        "ຄ່າສົ່ງ: 5.00",
        "ລວມທັງໝົດ: 245.00 LAK",
        "ຈອງສິນຄ້າໃຫ້ຮອດ 05/10/2026 13:00",
        "",
        "ຂອບໃຈທີ່ສັ່ງຊື້",
      ].join("\n"),
    );
  });

  it("ບໍ່ມີຄ່າສົ່ງ ແລະ ບໍ່ໄດ້ລໍຖ້າຊຳລະ (ບໍ່ມີເວລາຈອງ): ບໍ່ມີສອງບັນທັດນັ້ນ", () => {
    const text = buildOrderSummary(order({ shippingFee: "0.00", status: "PAID", reservedUntil: null }));
    expect(text).not.toContain("ຄ່າສົ່ງ");
    expect(text).not.toContain("ຈອງສິນຄ້າ");
    expect(text).toContain("ລວມທັງໝົດ: 245.00 LAK");
  });

  it("ລໍຖ້າຊຳລະແຕ່ບໍ່ມີ reservedUntil: ບໍ່ມີບັນທັດເວລາຈອງ", () => {
    expect(buildOrderSummary(order({ reservedUntil: null }))).not.toContain("ຈອງສິນຄ້າ");
  });

  it("ບໍ່ສັນຍາເລື່ອງການຊຳລະ (ຍັງບໍ່ມີ payment link): ບໍ່ມີ URL ໃນຂໍ້ຄວາມ", () => {
    expect(buildOrderSummary(order())).not.toMatch(/https?:\/\//);
  });

  it("ບິນໃຫຍ່ (100 ລາຍການ): ຍາວບໍ່ເກີນ MAX_MESSAGE_LENGTH, ຍັງມີເລກບິນ + ຍອດ ແລະ ບອກຈຳນວນລາຍການທີ່ຕັດ", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      productName: `ສິນຄ້າ ${"ກ".repeat(30)} ${index + 1}`,
      variantName: null,
      quantity: 1,
      unitPrice: "10.00",
      discount: "0.00",
      lineTotal: "10.00",
    }));
    const text = buildOrderSummary(order({ items, total: "1000.00", shippingFee: "0.00" }));
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(text).toContain("ເລກທີ SO-000001");
    expect(text).toContain("ລວມທັງໝົດ: 1,000.00 LAK");
    const listed = text.split("\n").filter((line) => /^\d+\. /.test(line)).length;
    const omitted = /ແລະ ອີກ (\d+) ລາຍການ/.exec(text);
    expect(listed).toBeGreaterThan(0);
    expect(listed).toBeLessThan(100);
    expect(Number(omitted?.[1])).toBe(100 - listed);
  });

  it("ລາຍການດຽວຊື່ຍາວ > 2000 ໂຕ: ຍັງບໍ່ເກີນ MAX_MESSAGE_LENGTH, ມີເລກບິນ + ຍອດ + ຂອບໃຈ, ແລະ ບອກວ່າຕັດ 1 ລາຍການ", () => {
    const items = [
      { productName: "ກ".repeat(2500), variantName: "ຂ".repeat(500), quantity: 1, unitPrice: "10.00", discount: "0.00", lineTotal: "10.00" },
    ];
    const text = buildOrderSummary(order({ items, total: "10.00", shippingFee: "0.00" }));
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(text).toContain("ເລກທີ SO-000001");
    expect(text).toContain("ລວມທັງໝົດ: 10.00 LAK");
    expect(text).toContain("ຂອບໃຈທີ່ສັ່ງຊື້");
    expect(text).toContain("ແລະ ອີກ 1 ລາຍການ");
  });

  it("ຊື່ຍາວຫຼາຍ + ຫຼາຍລາຍການ: ແຖວສັ້ນກວ່າທີ່ຢູ່ຫຼັງແຖວຍາວຍັງບໍ່ຖືກຂ້າມຢ່າງບໍ່ສອດຄ່ອງ (ຈຳນວນທີ່ຕັດ = ຈຳນວນທີ່ບໍ່ຢູ່ໃນລາຍການ)", () => {
    const items = [
      { productName: "ກ".repeat(2500), variantName: null, quantity: 1, unitPrice: "1.00", discount: "0.00", lineTotal: "1.00" },
      { productName: "Mug", variantName: null, quantity: 1, unitPrice: "1.00", discount: "0.00", lineTotal: "1.00" },
    ];
    const text = buildOrderSummary(order({ items, total: "2.00", shippingFee: "0.00" }));
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    const listed = text.split("\n").filter((line) => /^\d+\. /.test(line)).length;
    expect(Number(/ແລະ ອີກ (\d+) ລາຍການ/.exec(text)?.[1])).toBe(2 - listed);
  });
});
