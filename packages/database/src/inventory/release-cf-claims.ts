import type { Tx } from "./stock-engine";

/**
 * ຄືນຈຳນວນ CF ທີ່ "ຈອງໂຄຕ້າ" (LiveSessionItem.claimed) ຂອງບິນທີ່ຖືກ EXPIRED/CANCELLED.
 * ອ່ານ CfComment (outcome ORDERED, orderId) → ລວມ quantity ຕໍ່ itemId → claimed = GREATEST(claimed - n, 0).
 * ຕ້ອງເອີ້ນໃນ transaction ດຽວກັບ updateMany ທີ່ປ່ຽນສະຖານະ (ເມື່ອ count > 0) ເພື່ອໃຫ້ exactly-once ແລະ rollback ພ້ອມກັນ.
 * ບິນທີ່ບໍ່ແມ່ນ CF ຈະມີພຽງ 1 query (index orderId) ແລະ ບໍ່ເຮັດຫຍັງ. lines ທີ່ຜິດຮູບແບບຖືກຂ້າມ.
 */
export async function releaseCfClaims(tx: Tx, orderId: string): Promise<void> {
  const comments = await tx.cfComment.findMany({
    where: { orderId, outcome: "ORDERED" },
    select: { lines: true },
  });
  if (comments.length === 0) return;

  const perItem = new Map<string, number>();
  for (const comment of comments) {
    if (!Array.isArray(comment.lines)) continue;
    for (const line of comment.lines) {
      if (typeof line !== "object" || line === null || Array.isArray(line)) continue;
      const { itemId, quantity } = line as Record<string, unknown>;
      if (typeof itemId !== "string" || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
        continue;
      }
      perItem.set(itemId, (perItem.get(itemId) ?? 0) + quantity);
    }
  }

  for (const [itemId, quantity] of perItem) {
    await tx.$executeRaw`
      UPDATE "LiveSessionItem" SET "claimed" = GREATEST("claimed" - ${quantity}, 0) WHERE "id" = ${itemId}
    `;
  }
}
