import { describe, expect, it } from "vitest";
import { isSafeAttachmentUrl, safeAttachmentUrl, sendErrorKey } from "./inbox";

describe("isSafeAttachmentUrl", () => {
  it("ຮັບສະເພາະ https", () => {
    expect(isSafeAttachmentUrl("https://scontent.xx.fbcdn.net/a.jpg?x=1")).toBe(true);
  });
  it("ປະຕິເສດ http, javascript:, data:, ຄ່າວ່າງ/null/ບໍ່ແມ່ນ URL", () => {
    for (const value of ["http://x/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "", null, undefined, "not a url", "//x/a.jpg"]) {
      expect(isSafeAttachmentUrl(value), String(value)).toBe(false);
    }
  });
});

describe("sendErrorKey", () => {
  it("ລະຫັດທີ່ຮູ້ຈັກ → key ຂອງລະຫັດນັ້ນ", () => {
    expect(sendErrorKey("OUTSIDE_WINDOW")).toBe("inbox.sendError.OUTSIDE_WINDOW");
    expect(sendErrorKey("CHANNEL_NOT_CONFIGURED")).toBe("inbox.sendError.CHANNEL_NOT_CONFIGURED");
  });
  it("ບໍ່ຮູ້ຈັກ/null → UNKNOWN", () => {
    expect(sendErrorKey("WHATEVER")).toBe("inbox.sendError.UNKNOWN");
    expect(sendErrorKey(null)).toBe("inbox.sendError.UNKNOWN");
  });
});

describe("safeAttachmentUrl", () => {
  it("ຄືນ url ຖ້າ https, ບໍ່ດັ່ງນັ້ນ null", () => {
    expect(safeAttachmentUrl("https://scontent.xx.fbcdn.net/a.jpg")).toBe("https://scontent.xx.fbcdn.net/a.jpg");
    for (const value of ["http://x.test/a.jpg", "javascript:alert(1)", "", null, undefined]) {
      expect(safeAttachmentUrl(value), String(value)).toBeNull();
    }
  });
});
