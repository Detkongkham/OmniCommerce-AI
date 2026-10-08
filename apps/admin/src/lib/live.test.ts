import { describe, expect, it } from "vitest";
import { cfReplyErrorKey, startBlocker } from "./live";

describe("cfReplyErrorKey", () => {
  it("OUTSIDE_WINDOW ຂອງ Private Reply ມີຂໍ້ຄວາມສະເພາະ (7 ມື້ / ຕອບແລ້ວ)", () => {
    expect(cfReplyErrorKey("OUTSIDE_WINDOW")).toBe("live.replyError.OUTSIDE_WINDOW");
  });

  it("ລະຫັດສົ່ງອື່ນໃຊ້ຂໍ້ຄວາມຂອງ inbox; ບໍ່ຮູ້ຈັກ/null = UNKNOWN", () => {
    expect(cfReplyErrorKey("CHANNEL_AUTH")).toBe("inbox.sendError.CHANNEL_AUTH");
    expect(cfReplyErrorKey("SOMETHING_NEW")).toBe("inbox.sendError.UNKNOWN");
    expect(cfReplyErrorKey(null)).toBe("inbox.sendError.UNKNOWN");
  });
});

describe("startBlocker", () => {
  it("ບໍ່ມີ id ໂພສ ມາກ່ອນ ບໍ່ມີລະຫັດ", () => {
    expect(startBlocker({ externalPostId: null, itemCount: 0 })).toBe("noPost");
    expect(startBlocker({ externalPostId: "1_2", itemCount: 0 })).toBe("noItems");
    expect(startBlocker({ externalPostId: "1_2", itemCount: 3 })).toBeNull();
  });
});
