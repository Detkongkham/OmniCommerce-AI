import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { setupSlipTest } from "./slip-fixtures";

describe("slip review (e2e)", () => {
  const fx = setupSlipTest();
  const { db, server, as, enqueueRead, makeOrder, seedSlip } = fx;

  describe("ແກ້ຄ່າ / retry / ປະຕິເສດ", () => {
    const patchSlip = (id: string, body: object, headers: { Authorization: string }) =>
      request(server()).patch(`/slips/${id}`).set(headers).send(body);

    it("PATCH: ບັນທຶກ confirmed*, ຄິດ flag ໃໝ່, audit; ຮັບຍອດທີ່ມີຈຸດຂັ້ນ", async () => {
      const { slip } = await seedSlip({ readAmount: "5" });
      // ຄິດ header ກ່ອນສ້າງ request (supertest ເປີດ server ຕອນ request(server()) ແລະ ປິດເມື່ອຄຳຂໍອື່ນຈົບ)
      const owner = await as("OWNER");
      const accountant = await as("ACCOUNTANT");
      expect((await request(server()).get(`/slips/${slip.id}`).set(owner)).body.flags).toEqual([]);
      const res = await patchSlip(slip.id, { confirmedAmount: "100,000", confirmedRefNo: " ABC " }, accountant).expect(403);
      expect(res.body.code).toBe("FORBIDDEN");
      const ok = await patchSlip(slip.id, { confirmedAmount: "100,000", confirmedRefNo: " ABC " }, owner).expect(200);
      expect(ok.body.confirmed).toMatchObject({ amount: "100000.00", refNo: "ABC" });
      expect(ok.body.flags).toEqual([]);
      const wrong = await patchSlip(slip.id, { confirmedAmount: "1" }, owner).expect(200);
      expect(wrong.body.flags).toEqual(["AMOUNT_MISMATCH"]);
      expect(await db.auditLog.count({ where: { action: "slip.update", entityId: slip.id } })).toBe(2);
    });

    it("PATCH: CHAT_ADMIN (ບໍ່ມີ payments:write) → 403 ແລະ audit `after` ເປັນ JSON ປອດໄພ (Date → string, null ຄົງໄວ້)", async () => {
      const { slip } = await seedSlip();
      await patchSlip(slip.id, { confirmedRefNo: "x" }, await as("CHAT_ADMIN")).expect(403);
      await patchSlip(slip.id, { confirmedPaidAt: "2026-10-07T03:00:00.000Z", confirmedRefNo: null }, await as("OWNER")).expect(200);
      const log = await db.auditLog.findFirstOrThrow({ where: { action: "slip.update", entityId: slip.id } });
      expect(log.after).toEqual({ confirmedPaidAt: "2026-10-07T03:00:00.000Z", confirmedRefNo: null });
    });

    it("PATCH orderId: ຜູກ/ຍ້າຍບິນ (ຕ້ອງມີບິນ) ແລະ ຄິດ flag ກັບບິນໃໝ່; null ລ້າງຄ່າ", async () => {
      const { slip } = await seedSlip();
      const other = await makeOrder({ total: "999", subtotal: "999" });
      const owner = await as("OWNER");
      const moved = await patchSlip(slip.id, { orderId: other.id }, owner).expect(200);
      expect(moved.body.orderId).toBe(other.id);
      expect(moved.body.flags).toContain("AMOUNT_MISMATCH");
      expect((await patchSlip(slip.id, { orderId: "nope" }, owner).expect(404)).body.code).toBe("ORDER_NOT_FOUND");
      const cleared = await patchSlip(slip.id, { confirmedRefNo: null }, owner).expect(200);
      expect(cleared.body.confirmed.refNo).toBeNull();
    });

    it("PATCH orderId: ສະລິບຈາກແຊັດຍ້າຍໄປບິນຂອງເຄສອື່ນໄດ້ (ແອດມິນຕັດສິນ; ບໍ່ບັງຄັບເຄສດຽວກັນ)", async () => {
      const conversation = await db.conversation.create({
        data: { channel: "FACEBOOK", externalThreadId: `T${Math.random()}`, displayName: "C", lastMessageAt: new Date() },
      });
      const { slip } = await seedSlip({ source: "CHAT", conversationId: conversation.id });
      const foreign = await makeOrder();
      const res = await patchSlip(slip.id, { orderId: foreign.id }, await as("OWNER")).expect(200);
      expect(res.body.orderId).toBe(foreign.id);
      expect(res.body.conversationId).toBe(conversation.id);
    });

    it("PATCH: body ວ່າງ/ຜິດ → 400; ສະລິບບໍ່ມີ → 404; CONFIRMED/REJECTED ແກ້ບໍ່ໄດ້ → 409 SLIP_ALREADY_REVIEWED", async () => {
      const { slip } = await seedSlip();
      const owner = await as("OWNER");
      await patchSlip(slip.id, {}, owner).expect(400);
      await patchSlip(slip.id, { confirmedAmount: "abc" }, owner).expect(400);
      expect((await patchSlip("nope", { confirmedRefNo: "x" }, owner).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
      for (const status of ["CONFIRMED", "REJECTED"] as const) {
        await db.paymentSlip.update({ where: { id: slip.id }, data: { status } });
        expect((await patchSlip(slip.id, { confirmedRefNo: "x" }, owner).expect(409)).body.code).toBe("SLIP_ALREADY_REVIEWED");
      }
    });

    it("PATCH ແຂ່ງກັບ review: ສະລິບຖືກ CONFIRMED ລະຫວ່າງກວດ → 409 ແລະ ບໍ່ແກ້ຄ່າ", async () => {
      const { slip } = await seedSlip();
      const original = db.paymentSlip.findUnique.bind(db.paymentSlip) as (args: unknown) => Promise<unknown>;
      const spy = vi.spyOn(db.paymentSlip, "findUnique").mockImplementationOnce(((args: unknown) =>
        original(args).then(async (row) => {
          await db.paymentSlip.update({ where: { id: slip.id }, data: { status: "CONFIRMED" } });
          return row;
        })) as never);
      try {
        const res = await patchSlip(slip.id, { confirmedRefNo: "late" }, await as("OWNER")).expect(409);
        expect(res.body.code).toBe("SLIP_ALREADY_REVIEWED");
      } finally {
        spy.mockRestore();
      }
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).confirmedRefNo).toBeNull();
    });

    it("retry: ຕັ້ງ PENDING_READ ແລະ enqueue; ສະຖານະທີ່ review ແລ້ວ → 409; enqueue ລົ້ມ → ສະແດງ error", async () => {
      const { slip } = await seedSlip({ status: "READ_FAILED" });
      const owner = await as("OWNER");
      const chatAdmin = await as("CHAT_ADMIN");
      await request(server()).post(`/slips/${slip.id}/retry`).set(chatAdmin).expect(403);
      const res = await request(server()).post(`/slips/${slip.id}/retry`).set(owner).expect(200);
      expect(res.body.status).toBe("PENDING_READ");
      expect(enqueueRead).toHaveBeenCalledWith(slip.id);
      await db.paymentSlip.update({ where: { id: slip.id }, data: { status: "CONFIRMED" } });
      expect((await request(server()).post(`/slips/${slip.id}/retry`).set(owner).expect(409)).body.code).toBe("SLIP_ALREADY_REVIEWED");
      expect((await request(server()).post("/slips/nope/retry").set(owner).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
      await db.paymentSlip.update({ where: { id: slip.id }, data: { status: "READ" } });
      enqueueRead.mockRejectedValueOnce(new Error("redis down"));
      await request(server()).post(`/slips/${slip.id}/retry`).set(owner).expect(500);
    });

    it("retry: PENDING_READ → PENDING_READ enqueue ຊ້ຳ; enqueue ລົ້ມ → 500 ແຕ່ສະຖານະ PENDING_READ ຍັງຄົງ (ກົດ retry ໄດ້ອີກ)", async () => {
      const { slip } = await seedSlip({ status: "PENDING_READ" });
      const owner = await as("OWNER");
      const ok = await request(server()).post(`/slips/${slip.id}/retry`).set(owner).expect(200);
      expect(ok.body.status).toBe("PENDING_READ");
      expect(enqueueRead).toHaveBeenCalledTimes(1);
      await db.paymentSlip.update({ where: { id: slip.id }, data: { status: "READ_FAILED" } });
      enqueueRead.mockRejectedValueOnce(new Error("redis down"));
      await request(server()).post(`/slips/${slip.id}/retry`).set(owner).expect(500);
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("PENDING_READ");
    });

    it("reject: ຕ້ອງມີເຫດຜົນ, ບັນທຶກຜູ້ກວດ+ເວລາ, ບໍ່ແຕະບິນ; ຊ້ຳ → 409; ສິດ payments:write", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      const reject = (body: object, headers = owner) => request(server()).post(`/slips/${slip.id}/reject`).set(headers).send(body);
      await reject({ reason: "  " }).expect(400);
      await reject({ reason: "ຍອດບໍ່ຕົງ" }, await as("CHAT_ADMIN")).expect(403);
      const res = await reject({ reason: " ຍອດບໍ່ຕົງ " }).expect(200);
      expect(res.body).toMatchObject({ status: "REJECTED", rejectReason: "ຍອດບໍ່ຕົງ" });
      expect(res.body.reviewedBy).toMatchObject({ name: "OWNER" });
      expect(res.body.reviewedAt).not.toBeNull();
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
      expect((await reject({ reason: "again" }).expect(409)).body.code).toBe("SLIP_ALREADY_REVIEWED");
      expect(await db.auditLog.count({ where: { action: "slip.reject", entityId: slip.id } })).toBe(1);
      expect((await request(server()).post("/slips/nope/reject").set(owner).send({ reason: "x" }).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
    });
  });
});
