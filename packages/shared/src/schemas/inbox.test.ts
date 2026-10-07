import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_LENGTH,
  conversationListQuerySchema,
  createCustomerFromChatSchema,
  isMessageSendError,
  messageListQuerySchema,
  sendMessageSchema,
  updateConversationSchema,
} from "./inbox";

describe("conversationListQuerySchema", () => {
  it("ໃຊ້ຄ່າ default ແລະ ແປງ string", () => {
    expect(conversationListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 30 });
    expect(
      conversationListQuerySchema.parse({ page: "2", pageSize: "10", status: "OPEN", assignee: "me", unread: "true", q: " ab " }),
    ).toEqual({ page: 2, pageSize: 10, status: "OPEN", assignee: "me", unread: true, q: "ab" });
  });
  it("unread=false ແປງເປັນ false", () => {
    expect(conversationListQuerySchema.parse({ unread: "false" })).toEqual({ page: 1, pageSize: 30, unread: false });
  });
  it("ປະຕິເສດ status ຜິດ, pageSize > 100, unread ບໍ່ແມ່ນ true/false", () => {
    expect(conversationListQuerySchema.safeParse({ status: "NOPE" }).success).toBe(false);
    expect(conversationListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(conversationListQuerySchema.safeParse({ unread: "yes" }).success).toBe(false);
  });
});

describe("messageListQuerySchema", () => {
  it("default limit 50, ສູງສຸດ 100", () => {
    expect(messageListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(messageListQuerySchema.parse({ limit: "20", beforeId: "m1" })).toEqual({ limit: 20, beforeId: "m1" });
    expect(messageListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(messageListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("trim ແລ້ວຕ້ອງບໍ່ວ່າງ ແລະ ≤ MAX_MESSAGE_LENGTH", () => {
    expect(sendMessageSchema.parse({ text: "  ສະບາຍດີ  " })).toEqual({ text: "ສະບາຍດີ" });
    expect(sendMessageSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ text: "a".repeat(MAX_MESSAGE_LENGTH + 1) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ text: "a".repeat(MAX_MESSAGE_LENGTH) }).success).toBe(true);
  });
  it("ປະຕິເສດ field ເກີນ", () => {
    expect(sendMessageSchema.safeParse({ text: "x", extra: 1 }).success).toBe(false);
  });
});

describe("updateConversationSchema", () => {
  it("ຕ້ອງມີຢ່າງໜ້ອຍ 1 field ທີ່ມີຄ່າ", () => {
    expect(updateConversationSchema.safeParse({}).success).toBe(false);
    expect(updateConversationSchema.safeParse({ status: undefined }).success).toBe(false);
  });
  it("customerId: null ຢ່າງດຽວຖືກຮັບ", () => {
    expect(updateConversationSchema.parse({ customerId: null })).toEqual({ customerId: null });
  });
  it("ຮັບ null ເພື່ອຖອນຜູ້ຮັບຜິດຊອບ/ລູກຄ້າ", () => {
    expect(updateConversationSchema.parse({ assigneeId: null })).toEqual({ assigneeId: null });
    expect(updateConversationSchema.parse({ customerId: null, status: "CLOSED" })).toEqual({
      customerId: null,
      status: "CLOSED",
    });
  });
  it("ປະຕິເສດ status ຜິດ ແລະ field ເກີນ", () => {
    expect(updateConversationSchema.safeParse({ status: "NOPE" }).success).toBe(false);
    expect(updateConversationSchema.safeParse({ status: "OPEN", x: 1 }).success).toBe(false);
  });
});

describe("createCustomerFromChatSchema", () => {
  it("name ຈຳເປັນ; phone ເປັນຕົວເລກ 6-15 ຫຼັກ (ມີ + ໜ້າໄດ້) ແລະ optional", () => {
    expect(createCustomerFromChatSchema.parse({ name: " ສົມຊາຍ " })).toEqual({ name: "ສົມຊາຍ" });
    expect(createCustomerFromChatSchema.parse({ name: "A", phone: "+8562055555555" })).toEqual({
      name: "A",
      phone: "+8562055555555",
    });
    expect(createCustomerFromChatSchema.safeParse({ name: "A", phone: "12ab" }).success).toBe(false);
    expect(createCustomerFromChatSchema.safeParse({ name: " " }).success).toBe(false);
  });
  it("ຂອບເຂດ phone: 6 ແລະ 15 ຫຼັກຜ່ານ; 5, 16, '+' ດ່ຽວ, '12+3456' ບໍ່ຜ່ານ", () => {
    const ok = (phone: string) => createCustomerFromChatSchema.safeParse({ name: "A", phone }).success;
    expect(ok("123456")).toBe(true);
    expect(ok("1".repeat(15))).toBe(true);
    expect(ok("12345")).toBe(false);
    expect(ok("1".repeat(16))).toBe(false);
    expect(ok("+")).toBe(false);
    expect(ok("12+3456")).toBe(false);
  });
});

describe("isMessageSendError", () => {
  it("ຮັບສະເພາະລະຫັດໃນ MESSAGE_SEND_ERRORS", () => {
    for (const code of ["OUTSIDE_WINDOW", "CHANNEL_AUTH", "CHANNEL_NOT_CONFIGURED", "CHANNEL_UNAVAILABLE", "SEND_REJECTED"]) {
      expect(isMessageSendError(code), code).toBe(true);
    }
    for (const value of ["", "nope", "outside_window", null, undefined, 1]) {
      expect(isMessageSendError(value), String(value)).toBe(false);
    }
  });
});
