import { describe, expect, it } from "vitest";
import { detectImageType } from "./image-type";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")]);

describe("detectImageType", () => {
  it("ຮູ້ຈັກ JPEG, PNG, WebP ຈາກ magic bytes", () => {
    expect(detectImageType(JPEG)).toEqual({ mimeType: "image/jpeg", extension: "jpg" });
    expect(detectImageType(PNG)).toEqual({ mimeType: "image/png", extension: "png" });
    expect(detectImageType(WEBP)).toEqual({ mimeType: "image/webp", extension: "webp" });
  });

  it("ອັນອື່ນ/ສັ້ນເກີນ/RIFF ທີ່ບໍ່ແມ່ນ WEBP = null", () => {
    expect(detectImageType(Buffer.from("GIF89a......"))).toBeNull();
    expect(detectImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WAVEfmt ")]))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});
