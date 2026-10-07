import { describe, expect, it } from "vitest";
import {
  cfCommentListQuerySchema,
  createLiveItemSchema,
  createLiveSessionSchema,
  liveSessionListQuerySchema,
  updateLiveItemSchema,
  updateLiveSessionSchema,
} from "./live-cf";

describe("live-cf schemas", () => {
  it("createLiveSession: default publicReplyEnabled=true, externalPostId ບໍ່ບັງຄັບ", () => {
    const parsed = createLiveSessionSchema.parse({ title: " Live ຄືນນີ້ ", kind: "LIVE" });
    expect(parsed).toEqual({ title: "Live ຄືນນີ້", kind: "LIVE", publicReplyEnabled: true });
  });
  it("createLiveSession: kind ຜິດ / ຊື່ວ່າງ / externalPostId ມີຕົວອັກສອນແປກ → ຜິດ", () => {
    expect(createLiveSessionSchema.safeParse({ title: "x", kind: "VIDEO" }).success).toBe(false);
    expect(createLiveSessionSchema.safeParse({ title: " ", kind: "LIVE" }).success).toBe(false);
    expect(createLiveSessionSchema.safeParse({ title: "x", kind: "LIVE", externalPostId: "a b/c" }).success).toBe(false);
    expect(createLiveSessionSchema.safeParse({ title: "x", kind: "LIVE", externalPostId: "123_456" }).success).toBe(true);
  });
  it("updateLiveSession: ຕ້ອງມີຢ່າງໜ້ອຍ 1 field, externalPostId ເປັນ null ໄດ້", () => {
    expect(updateLiveSessionSchema.safeParse({}).success).toBe(false);
    expect(updateLiveSessionSchema.parse({ externalPostId: null })).toEqual({ externalPostId: null });
  });
  it("createLiveItem: normalize ລະຫັດ, limit 1..100000 ຫຼື null", () => {
    expect(createLiveItemSchema.parse({ code: " ດຳ  m ", variantId: "v1" }).code).toBe("ດຳ M");
    expect(createLiveItemSchema.parse({ code: "a1", variantId: "v1", limit: null }).limit).toBeNull();
    expect(createLiveItemSchema.safeParse({ code: "A1", variantId: "v1", limit: 0 }).success).toBe(false);
    expect(createLiveItemSchema.safeParse({ code: "   ", variantId: "v1" }).success).toBe(false);
    expect(createLiveItemSchema.safeParse({ code: "X".repeat(31), variantId: "v1" }).success).toBe(false);
  });
  it("createLiveItem: ລະຫັດມີ , ; + ຖືກປະຕິເສດ (parser ຈັບຄູ່ບໍ່ໄດ້), ຊ່ອງວ່າງພາຍໃນໃຊ້ໄດ້", () => {
    for (const code of ["A,1", "A;1", "A+1", ",A", "A+"]) {
      expect(createLiveItemSchema.safeParse({ code, variantId: "v1" }).success).toBe(false);
    }
    expect(createLiveItemSchema.safeParse({ code: "A 1", variantId: "v1" }).success).toBe(true);
  });
  it("updateLiveItem: ຕ້ອງມີຢ່າງໜ້ອຍ 1 field", () => {
    expect(updateLiveItemSchema.safeParse({}).success).toBe(false);
    expect(updateLiveItemSchema.parse({ limit: 5 })).toEqual({ limit: 5 });
  });
  it("query: default page/pageSize ແລະ coerce", () => {
    expect(liveSessionListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 30 });
    expect(cfCommentListQuerySchema.parse({ outcome: "ORDERED", page: "2" })).toEqual({ page: 2, pageSize: 50, outcome: "ORDERED" });
    expect(cfCommentListQuerySchema.safeParse({ outcome: "NOPE" }).success).toBe(false);
  });
});
