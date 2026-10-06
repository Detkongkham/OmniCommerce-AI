import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidSignature, signBody } from "./signature";

const SECRET = "app-secret";
const BODY = Buffer.from('{"object":"page"}');

describe("signBody", () => {
  it("ເປັນ sha256=<hex ຂອງ HMAC-SHA256>", () => {
    const expected = `sha256=${createHmac("sha256", SECRET).update(BODY).digest("hex")}`;
    expect(signBody(SECRET, BODY)).toBe(expected);
    expect(signBody(SECRET, BODY.toString())).toBe(expected);
  });
});

describe("isValidSignature", () => {
  it("ຖືກຕ້ອງເມື່ອ secret + body + header ຕົງກັນ", () => {
    expect(isValidSignature(SECRET, BODY, signBody(SECRET, BODY))).toBe(true);
  });
  it("ຜິດເມື່ອ body ຖືກແກ້ ຫຼື secret ຕ່າງ", () => {
    expect(isValidSignature(SECRET, Buffer.from('{"object":"x"}'), signBody(SECRET, BODY))).toBe(false);
    expect(isValidSignature("other", BODY, signBody(SECRET, BODY))).toBe(false);
  });
  it("ຜິດເມື່ອ header ຂາດ, ບໍ່ມີ prefix, ຍາວຕ່າງ ຫຼື secret ບໍ່ໄດ້ຕັ້ງ", () => {
    expect(isValidSignature(SECRET, BODY, undefined)).toBe(false);
    expect(isValidSignature(SECRET, BODY, "deadbeef")).toBe(false);
    expect(isValidSignature(SECRET, BODY, "sha256=abc")).toBe(false);
    expect(isValidSignature(undefined, BODY, signBody(SECRET, BODY))).toBe(false);
    expect(isValidSignature("", BODY, signBody("", BODY))).toBe(false);
  });
  it("ຜິດເມື່ອ hex ເປັນຕົວພິມໃຫຍ່, header ບໍ່ແມ່ນ string ຫຼື garbage ຍາວເທົ່າກັນ", () => {
    const good = signBody(SECRET, BODY);
    expect(isValidSignature(SECRET, BODY, `sha256=${good.slice(7).toUpperCase()}`)).toBe(false);
    expect(isValidSignature(SECRET, BODY, ["sha256=abc"] as unknown as string)).toBe(false);
    expect(isValidSignature(SECRET, BODY, `sha256=${"z".repeat(good.length - 7)}`)).toBe(false);
  });
});
