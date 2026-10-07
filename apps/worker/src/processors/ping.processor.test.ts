import { describe, expect, it } from "vitest";
import { handlePing } from "./ping.processor";

describe("handlePing", () => {
  const fixed = () => new Date("2026-10-04T00:00:00.000Z");

  it("ຕອບ pong ພ້ອມ message default", () => {
    expect(handlePing({}, fixed)).toEqual({ pong: true, message: "ping", at: "2026-10-04T00:00:00.000Z" });
  });

  it("ສົ່ງ message ທີ່ໄດ້ຮັບຄືນ", () => {
    expect(handlePing({ message: "hello" }, fixed).message).toBe("hello");
  });
});
