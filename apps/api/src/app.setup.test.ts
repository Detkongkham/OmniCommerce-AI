import { describe, expect, it } from "vitest";
import { parseCorsOrigins } from "./app.setup";

describe("parseCorsOrigins", () => {
  it("splits on commas, trims whitespace and drops empty entries", () => {
    expect(parseCorsOrigins("http://a.com, http://b.com ,,  ")).toEqual(["http://a.com", "http://b.com"]);
    expect(parseCorsOrigins("http://a.com")).toEqual(["http://a.com"]);
    expect(parseCorsOrigins("")).toEqual([]);
  });
});
