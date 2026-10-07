import { describe, expect, it } from "vitest";
import { FakeSlipReader, createSlipReader } from "./index";

const image = { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" };

describe("FakeSlipReader", () => {
  it("ຄ່າເລີ່ມຕົ້ນ: ຜົນວ່າງ (ໃຫ້ແອດມິນຕື່ມມື)", async () => {
    const result = await new FakeSlipReader().read(image);
    expect(result).toEqual({ raw: {} });
  });

  it("ຄືນຜົນຕາມທີ່ຕັ້ງ ແລະ ເກັບ raw", async () => {
    const reader = new FakeSlipReader({ amount: "1000.00", currency: "LAK", refNo: "R1" });
    expect(await reader.read(image)).toEqual({
      amount: "1000.00",
      currency: "LAK",
      refNo: "R1",
      raw: { amount: "1000.00", currency: "LAK", refNo: "R1" },
    });
  });

  it("throw ເມື່ອຕັ້ງ failWith (ຈຳລອງ reader ລົ້ມ)", async () => {
    await expect(new FakeSlipReader({}, { failWith: "boom" }).read(image)).rejects.toThrow("boom");
  });

  it("ມີ name/version", () => {
    const reader = new FakeSlipReader();
    expect(reader.name).toBe("fake");
    expect(reader.version).toBe("1");
  });
});

describe("createSlipReader", () => {
  it("fake (ຄ່າເລີ່ມຕົ້ນ) ອ່ານ JSON ຈາກ SLIP_FAKE_RESULT", async () => {
    const reader = createSlipReader({ SLIP_FAKE_RESULT: '{"amount":"5.00","refNo":"Z"}' });
    expect(await reader.read(image)).toMatchObject({ amount: "5.00", refNo: "Z" });
    expect(createSlipReader({}).name).toBe("fake");
  });

  it("SLIP_FAKE_RESULT ບໍ່ແມ່ນ JSON ຖືກ → throw ຕອນສ້າງ", () => {
    expect(() => createSlipReader({ SLIP_FAKE_RESULT: "{nope" })).toThrow("SLIP_FAKE_RESULT");
  });

  it("ຊື່ reader ທີ່ບໍ່ຮູ້ຈັກ → throw", () => {
    expect(() => createSlipReader({ SLIP_READER: "magic" })).toThrow("Unknown SLIP_READER");
  });
});
