import { describe, expect, it, vi } from "vitest";
import { handleSlipJobFailed } from "./slip.worker";

describe("handleSlipJobFailed (ຕາໜ່າງຄວາມປອດໄພເມື່ອ job ລົ້ມຄົບຈຳນວນຄັ້ງ)", () => {
  const db = {} as never;
  const makeDeps = (markResult: boolean | Error = true) => ({
    db,
    markFailed: vi.fn(async () => {
      if (markResult instanceof Error) throw markResult;
      return markResult;
    }),
    logger: { error: vi.fn(), warn: vi.fn() },
  });
  const job = (overrides: Record<string, unknown> = {}) =>
    ({ name: "read-slip", data: { slipId: "s1" }, attemptsMade: 3, opts: { attempts: 3 }, ...overrides }) as never;

  it("ໝົດໂອກາດ → mark READ_FAILED ແລະ log", async () => {
    const deps = makeDeps(true);
    await handleSlipJobFailed(deps, job(), new Error("stalled more than allowable limit"));
    expect(deps.markFailed).toHaveBeenCalledWith(db, "s1");
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it("ຍັງມີໂອກາດ retry → ບໍ່ແຕະ", async () => {
    const deps = makeDeps();
    await handleSlipJobFailed(deps, job({ attemptsMade: 1 }), new Error("x"));
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("ບໍ່ມີ attempts (ຄ່າເລີ່ມຕົ້ນ 1) ແລະ ລົ້ມ 1 ຄັ້ງ → mark", async () => {
    const deps = makeDeps();
    await handleSlipJobFailed(deps, job({ attemptsMade: 1, opts: {} }), new Error("x"));
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
  });

  it("job ຫາຍ / ຊື່ອື່ນ / ບໍ່ມີ slipId → ບໍ່ແຕະ", async () => {
    const deps = makeDeps();
    await handleSlipJobFailed(deps, undefined, new Error("x"));
    await handleSlipJobFailed(deps, job({ name: "other" }), new Error("x"));
    await handleSlipJobFailed(deps, job({ data: {} }), new Error("x"));
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("mark ຄືນ false (ມີຄົນຈັດການແລ້ວ) → ບໍ່ log warn", async () => {
    const deps = makeDeps(false);
    await handleSlipJobFailed(deps, job(), new Error("x"));
    expect(deps.logger.warn).not.toHaveBeenCalled();
  });

  it("mark ລົ້ມ → ບໍ່ throw, log error", async () => {
    const deps = makeDeps(new Error("db down"));
    await expect(handleSlipJobFailed(deps, job(), new Error("x"))).resolves.toBeUndefined();
    expect(deps.logger.error).toHaveBeenCalledWith(expect.stringContaining("db down"));
  });
});
