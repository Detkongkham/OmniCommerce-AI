import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_LENGTH,
  conversationListQuerySchema,
  createCustomerFromChatSchema,
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
});
