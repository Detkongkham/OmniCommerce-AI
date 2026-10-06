import { describe, expect, it } from "vitest";
import { type SseFrame, createSseParser } from "./sse";

function collect(chunks: string[]): SseFrame[] {
  const frames: SseFrame[] = [];
  const feed = createSseParser((frame) => frames.push(frame));
  for (const chunk of chunks) feed(chunk);
  return frames;
}

describe("createSseParser", () => {
  it("frame ປົກກະຕິຂອງ Nest: event + data ແລ້ວເສັ້ນວ່າງ", () => {
    expect(collect(['event: ready\ndata: {}\n\n'])).toEqual([{ event: "ready", data: "{}" }]);
  });

  it("ຫຼາຍ frame ໃນ chunk ດຽວ", () => {
    expect(collect(["event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"])).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
  });

  it("chunk ຖືກຕັດກາງບັນທັດ/ກາງ frame", () => {
    expect(collect(["eve", "nt: up", "dated\nda", 'ta: {"x":1}\n', "\n"])).toEqual([{ event: "updated", data: '{"x":1}' }]);
  });

  it("CRLF ແລະ CR; \\r\\n ທີ່ຖືກຕັດລະຫວ່າງ chunk", () => {
    expect(collect(["event: a\r\ndata: 1\r\n\r\n"])).toEqual([{ event: "a", data: "1" }]);
    expect(collect(["event: a\r", "\ndata: 1\r", "\n\r", "\n"])).toEqual([{ event: "a", data: "1" }]);
    expect(collect(["event: a\rdata: 1\r\r"])).toEqual([{ event: "a", data: "1" }]);
  });

  it("ບັນທັດ comment (ຂຶ້ນຕົ້ນດ້ວຍ :) ຖືກຂ້າມ ແລະ ບໍ່ສ້າງ frame ເອງ", () => {
    expect(collect([": keepalive\n\n"])).toEqual([]);
    expect(collect([": hi\nevent: a\ndata: 1\n\n"])).toEqual([{ event: "a", data: "1" }]);
  });

  it("data ຫຼາຍບັນທັດຖືກຕໍ່ດ້ວຍ \\n; ບໍ່ມີ event = message; field ທີ່ບໍ່ຮູ້ຈັກຖືກຂ້າມ; ຊ່ອງວ່າງດຽວຫຼັງ : ຖືກຕັດ", () => {
    expect(collect(["data: a\ndata: b\nid: 5\nretry: 10\n\n"])).toEqual([{ event: "message", data: "a\nb" }]);
    expect(collect(["event:x\ndata:  y\n\n"])).toEqual([{ event: "x", data: " y" }]);
  });

  it("frame ທີ່ບໍ່ມີ data ແຕ່ມີ event ກໍສົ່ງ; ເສັ້ນວ່າງຊ້ຳບໍ່ສ້າງ frame", () => {
    expect(collect(["event: ping\n\n\n\n"])).toEqual([{ event: "ping", data: "" }]);
  });

  it("frame ທີ່ຍັງບໍ່ຈົບ (ບໍ່ມີເສັ້ນວ່າງ) ບໍ່ຖືກສົ່ງ", () => {
    expect(collect(["event: a\ndata: 1\n"])).toEqual([]);
  });
});
