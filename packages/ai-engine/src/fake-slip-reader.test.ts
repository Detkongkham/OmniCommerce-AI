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

  it("failWith ເປັນສະຕຣິງວ່າງ ກໍ່ຍັງ throw", async () => {
    await expect(new FakeSlipReader({}, { failWith: "" }).read(image)).rejects.toThrow();
  });

  it("raw ບໍ່ແມ່ນ object ດຽວກັບ fields ທີ່ຮັບເຂົ້າ", async () => {
    const fields = { amount: "1.00" };
    const result = await new FakeSlipReader(fields).read(image);
    expect(result.raw).toEqual(fields);
    expect(result.raw).not.toBe(fields);
  });

  it("signal ຖືກ abort ແລ້ວ → reject ດ້ວຍ reason ຂອງ signal", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    await expect(new FakeSlipReader().read(image, { signal: controller.signal })).rejects.toBe(reason);
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

  it.each(["null", "5", '"str"', "[1]", '{"amount":5}', '{"foo":"x"}'])(
    "SLIP_FAKE_RESULT ຮູບແບບບໍ່ຖືກ (%s) → throw",
    (value) => {
      expect(() => createSlipReader({ SLIP_FAKE_RESULT: value })).toThrow("SLIP_FAKE_RESULT");
    },
  );

  it("SLIP_READER ລະບຸ fake ຊັດເຈນ ໃຊ້ໄດ້", () => {
    expect(createSlipReader({ SLIP_READER: "fake" }).name).toBe("fake");
  });

  it("SLIP_FAKE_RESULT ບໍ່ແມ່ນ JSON ຖືກ → throw ຕອນສ້າງ", () => {
    expect(() => createSlipReader({ SLIP_FAKE_RESULT: "{nope" })).toThrow("SLIP_FAKE_RESULT");
  });

  it("ຊື່ reader ທີ່ບໍ່ຮູ້ຈັກ → throw", () => {
    expect(() => createSlipReader({ SLIP_READER: "magic" })).toThrow("Unknown SLIP_READER");
  });
});
