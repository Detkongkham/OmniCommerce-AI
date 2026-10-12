import type { PrismaClient } from "@oca/database";
import { describe, expect, it, vi } from "vitest";
import { recomputeMemberTiersJob } from "./recompute-member-tiers.processor";

describe("recomputeMemberTiersJob", () => {
  it("ສົ່ງຕໍ່ໃຫ້ engine ແລະ ຄືນຜົນ", async () => {
    const db = {} as PrismaClient;
    const run = vi.fn().mockResolvedValue({ checked: 3, changed: 1, skipped: false });
    expect(await recomputeMemberTiersJob(db, run)).toEqual({ checked: 3, changed: 1, skipped: false });
    expect(run).toHaveBeenCalledWith(db);
  });
});
