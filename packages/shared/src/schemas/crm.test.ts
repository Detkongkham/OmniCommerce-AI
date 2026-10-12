import { describe, expect, it } from "vitest";
import { RFM_SEGMENTS, crmCustomerListQuerySchema, mergeCustomerSchema, updateCustomerSchema } from "./crm";

describe("crmCustomerListQuerySchema", () => {
  it("ຄ່າເລີ່ມຕົ້ນ: page 1, pageSize 20, sort lastOrder", () => {
    expect(crmCustomerListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, sort: "lastOrder" });
  });
  it("ຮັບ q, segment, sort ແລະ ແປງ page ຈາກ string", () => {
    expect(crmCustomerListQuerySchema.parse({ q: " mali ", segment: "AT_RISK", sort: "spent", page: "2", pageSize: "50" })).toEqual({
      q: "mali",
      segment: "AT_RISK",
      sort: "spent",
      page: 2,
      pageSize: 50,
    });
  });
  it("ປະຕິເສດ segment/sort ທີ່ບໍ່ຮູ້ຈັກ ແລະ pageSize > 100", () => {
    expect(crmCustomerListQuerySchema.safeParse({ segment: "VIP" }).success).toBe(false);
    expect(crmCustomerListQuerySchema.safeParse({ sort: "name" }).success).toBe(false);
    expect(crmCustomerListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
  it("ມີ 6 ກຸ່ມ", () => {
    expect(RFM_SEGMENTS).toEqual(["CHAMPION", "LOYAL", "NEW", "AT_RISK", "LOST", "REGULAR"]);
  });
});

describe("updateCustomerSchema", () => {
  it("trim ແລະ ແປງຄ່າເປົ່າເປັນ null", () => {
    expect(updateCustomerSchema.parse({ name: " ມະລິ ", phone: "", email: "", note: "  " })).toEqual({ name: "ມະລິ", phone: null, email: null, note: null });
  });
  it("ຮັບເບີ ແລະ ອີເມວທີ່ຖືກຕ້ອງ", () => {
    expect(updateCustomerSchema.parse({ phone: "02055550001", email: "a@b.co" })).toEqual({ phone: "02055550001", email: "a@b.co" });
  });
  it("ປະຕິເສດ: ບໍ່ມີ field, ຊື່ເປົ່າ, ເບີຜິດ, ອີເມວຜິດ, field ແປກ", () => {
    for (const body of [{}, { name: " " }, { phone: "abc" }, { email: "nope" }, { tier: "GOLD" }]) {
      expect(updateCustomerSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("mergeCustomerSchema", () => {
  it("ຕ້ອງມີ sourceId", () => {
    expect(mergeCustomerSchema.parse({ sourceId: "c1" })).toEqual({ sourceId: "c1" });
    expect(mergeCustomerSchema.safeParse({}).success).toBe(false);
    expect(mergeCustomerSchema.safeParse({ sourceId: "" }).success).toBe(false);
  });
});
