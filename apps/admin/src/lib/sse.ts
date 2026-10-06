export interface SseFrame {
  event: string;
  data: string;
}

/** ເພດານຂອງບັນທັດທີ່ຄ້າງ ແລະ data ທີ່ສະສົມ ກັນ stream ທີ່ບໍ່ຈົບ frame ເຮັດໃຫ້ໜ່ວຍຄວາມຈຳບວມ */
export const MAX_BUFFER = 1_048_576;

const LINE_END = /\r\n|\n|\r/;

/**
 * parser ຂອງ `text/event-stream` (ຕາມ WHATWG): ປ້ອນ chunk ຂໍ້ຄວາມເລື້ອຍໆ; ເອີ້ນ `onFrame` ເມື່ອໄດ້ frame ຄົບ (ເສັ້ນວ່າງ).
 * ຮອງຮັບ \n, \r\n, \r ແລະ chunk ທີ່ຖືກຕັດກາງບັນທັດ. ມີສະເພາະ field `event` ແລະ `data` ທີ່ໃຊ້; ອື່ນໆ (id, retry, comment) ຖືກຂ້າມ.
 * BOM ຕົ້ນ stream ຖືກ TextDecoder ຂອງ client ຕັດໃຫ້ແລ້ວ ຈຶ່ງບໍ່ຈັດການທີ່ນີ້.
 */
export function createSseParser(onFrame: (frame: SseFrame) => void): (chunk: string) => void {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  // ຫຼັງ "\r" ທີ່ຢູ່ທ້າຍ chunk: ຖ້າ chunk ຕໍ່ໄປຂຶ້ນຕົ້ນດ້ວຍ "\n" ມັນເປັນຄົ່ງທີ່ສອງຂອງ "\r\n" ຕ້ອງຂ້າມ
  let skipLf = false;
  let dataSize = 0;

  const flush = () => {
    if (event !== "" || data.length > 0) onFrame({ event: event || "message", data: data.join("\n") });
    event = "";
    data = [];
    dataSize = 0;
  };

  const handleLine = (line: string) => {
    if (line === "") return flush();
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") {
      dataSize += value.length + 1;
      if (dataSize > MAX_BUFFER) throw new Error("SSE frame too large");
      data.push(value);
    }
  };

  return (chunk) => {
    if (skipLf && chunk !== "") {
      skipLf = false;
      if (chunk.startsWith("\n")) chunk = chunk.slice(1);
    }
    buffer += chunk;
    for (;;) {
      const match = LINE_END.exec(buffer);
      if (!match) {
        if (buffer.length > MAX_BUFFER) throw new Error("SSE frame too large");
        return;
      }
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      // "\r" ທ້າຍ buffer ອາດເປັນຄົ່ງທຳອິດຂອງ "\r\n" ທີ່ຖືກຕັດ: ຈົບບັນທັດເລີຍ ແລ້ວຈື່ໄວ້ວ່າຕ້ອງຂ້າມ "\n" ທີ່ຕາມມາ
      if (match[0] === "\r" && buffer === "") skipLf = true;
      handleLine(line);
    }
  };
}
