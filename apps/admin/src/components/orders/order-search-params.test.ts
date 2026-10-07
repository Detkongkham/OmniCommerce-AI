import { describe, expect, it } from "vitest";
import { parseOrderSearchParams } from "./order-search-params";

describe("parseOrderSearchParams", () => {
  it("trim q, array ເອົາຄ່າທຳອິດ, status ທີ່ບໍ່ຮູ້ຈັກ = ບໍ່ກັ່ນຕອງ", () => {
    expect(parseOrderSearchParams({ q: "  mali ", status: "PAID" })).toEqual({ q: "mali", status: "PAID" });
    expect(parseOrderSearchParams({ q: ["a", "b"], status: ["SHIPPED", "PAID"] })).toEqual({ q: "a", status: "SHIPPED" });
    expect(parseOrderSearchParams({ status: "paid" })).toEqual({ q: "", status: "" });
    expect(parseOrderSearchParams({ status: "HACK" })).toEqual({ q: "", status: "" });
    expect(parseOrderSearchParams({})).toEqual({ q: "", status: "" });
  });
});
