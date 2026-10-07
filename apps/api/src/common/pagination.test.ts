import { describe, expect, it } from "vitest";
import { pageArgs, toPage } from "./pagination";

describe("pagination", () => {
  it("pageArgs ຄຳນວນ skip/take", () => {
    expect(pageArgs(1, 20)).toEqual({ skip: 0, take: 20 });
    expect(pageArgs(3, 50)).toEqual({ skip: 100, take: 50 });
  });
  it("toPage ຫໍ່ຜົນລັບ", () => {
    expect(toPage(["a"], 7, 2, 5)).toEqual({ items: ["a"], total: 7, page: 2, pageSize: 5 });
  });
});
