import request from "supertest";
import { Logger } from "@nestjs/common";
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

  describe("ຢືນຢັນ", () => {
    const confirm = (id: string, headers: { Authorization: string }) =>
      request(server()).post(`/slips/${id}/confirm`).set(headers).send({});

    it("200: ສະລິບ CONFIRMED + ຄ່າ confirmed* ເຕີມຈາກຄ່າທີ່ອ່ານ + ບິນ PAID + ຜູ້ກວດ + audit ທັງ slip.confirm ແລະ order.pay", async () => {
      const { order, slip } = await seedSlip({ readPaidAt: new Date("2026-10-07T09:00:00.000Z"), readDestAccount: "010-12" });
      const res = await confirm(slip.id, await as("OWNER")).expect(200);
      expect(res.body).toMatchObject({
        status: "CONFIRMED",
        confirmed: { amount: "100000.00", currency: "LAK", refNo: "R1", destAccount: "010-12" },
      });
      expect(res.body.reviewedBy).toMatchObject({ name: "OWNER" });
      const paid = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(paid.status).toBe("PAID");
      expect(paid.paidAt).not.toBeNull();
      expect(await db.auditLog.count({ where: { action: "slip.confirm", entityId: slip.id } })).toBe(1);
      expect(await db.auditLog.count({ where: { action: "order.pay", entityId: order.id } })).toBe(1);
    });

    it("ໃຊ້ຄ່າທີ່ແອດມິນແກ້ (confirmed*) ກ່ອນຄ່າທີ່ອ່ານ", async () => {
      const { slip } = await seedSlip({ readAmount: "5", confirmedAmount: "100000" });
      const res = await confirm(slip.id, await as("OWNER")).expect(200);
      expect(res.body.confirmed.amount).toBe("100000.00");
    });

    it("ສິດ: CHAT_ADMIN (ບໍ່ມີ payments:write) → 403 ແລະ ບໍ່ປ່ຽນຫຍັງ", async () => {
      const { order, slip } = await seedSlip();
      await confirm(slip.id, await as("CHAT_ADMIN")).expect(403);
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    });

    it("ຍັງບໍ່ຜູກບິນ → 409 SLIP_NOT_LINKED; ບໍ່ມີຍອດ → 422 SLIP_AMOUNT_REQUIRED; ຍັງ PENDING_READ → 409 CONFLICT", async () => {
      const owner = await as("OWNER");
      const unlinked = await seedSlip({ orderId: null });
      expect((await confirm(unlinked.slip.id, owner).expect(409)).body.code).toBe("SLIP_NOT_LINKED");
      const noAmount = await seedSlip({ readAmount: null });
      expect((await confirm(noAmount.slip.id, owner).expect(422)).body.code).toBe("SLIP_AMOUNT_REQUIRED");
      const pending = await seedSlip({ status: "PENDING_READ" });
      expect((await confirm(pending.slip.id, owner).expect(409)).body.code).toBe("CONFLICT");
      expect((await confirm("nope", owner).expect(404)).body.code).toBe("SLIP_NOT_FOUND");
    });

    it("READ_FAILED ຢືນຢັນໄດ້ ຖ້າແອດມິນຕື່ມຍອດມື", async () => {
      const { slip } = await seedSlip({ status: "READ_FAILED", readAmount: null, readRefNo: null });
      const owner = await as("OWNER");
      await confirm(slip.id, owner).expect(422);
      await request(server()).patch(`/slips/${slip.id}`).set(owner).send({ confirmedAmount: "100000" }).expect(200);
      await confirm(slip.id, owner).expect(200);
    });

    it("ຢືນຢັນຊ້ຳ → 409 SLIP_ALREADY_REVIEWED; ບິນຖືກ pay ຄັ້ງດຽວ", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      await confirm(slip.id, owner).expect(200);
      expect((await confirm(slip.id, owner).expect(409)).body.code).toBe("SLIP_ALREADY_REVIEWED");
      expect(await db.auditLog.count({ where: { action: "order.pay", entityId: order.id } })).toBe(1);
    });

    it("ບິນ EXPIRED/CANCELLED/PAID ແລ້ວ → 409 ORDER_INVALID_STATE ແລະ ສະລິບ rollback (ຍັງ READ, ບໍ່ມີ confirmed*)", async () => {
      const owner = await as("OWNER");
      for (const status of ["EXPIRED", "CANCELLED", "PAID"]) {
        const { slip } = await seedSlip({}, { status });
        const res = await confirm(slip.id, owner).expect(409);
        expect(res.body.code, status).toBe("ORDER_INVALID_STATE");
        const after = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
        expect(after.status).toBe("READ");
        expect(after.confirmedAmount).toBeNull();
        expect(after.reviewedByUserId).toBeNull();
      }
    });

    it("ໝົດເວລາຈອງແຕ່ worker ຍັງບໍ່ໄດ້ expire → 409 RESERVATION_EXPIRED ແລະ rollback", async () => {
      const { order, slip } = await seedSlip({}, { reservedUntil: new Date(Date.now() - 1000) });
      const res = await confirm(slip.id, await as("OWNER")).expect(409);
      expect(res.body.code).toBe("RESERVATION_EXPIRED");
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("READ");
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    });

    it("ຢືນຢັນພ້ອມກັນ 2 ຄັ້ງ → ສຳເລັດຄັ້ງດຽວ ອີກຄັ້ງ 409", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      const results = await Promise.all([confirm(slip.id, owner), confirm(slip.id, owner)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await db.auditLog.count({ where: { action: "order.pay", entityId: order.id } })).toBe(1);
    });

    it("ສະລິບອື່ນຂອງບິນດຽວກັນບໍ່ຖືກປ່ຽນ (ບໍ່ auto-reject)", async () => {
      const { order, slip } = await seedSlip();
      const other = await db.paymentSlip.create({
        data: { source: "UPLOAD", orderId: order.id, imageKey: "slips/o", imageMime: "image/png", imageBytes: 1, imageSha256: "f".repeat(64), status: "READ" },
      });
      await confirm(slip.id, await as("OWNER")).expect(200);
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("READ");
    });

    it("ແຂ່ງກັບ reject: ສະລິບຖືກ REJECTED ລະຫວ່າງກວດກັບ claim → 409 SLIP_ALREADY_REVIEWED, ບໍ່ pay ບິນ, ຍັງ REJECTED", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      const original = db.paymentSlip.findUnique.bind(db.paymentSlip) as (args: unknown) => Promise<unknown>;
      const spy = vi.spyOn(db.paymentSlip, "findUnique").mockImplementationOnce(((args: unknown) =>
        original(args).then(async (row) => {
          await db.paymentSlip.update({ where: { id: slip.id }, data: { status: "REJECTED", rejectReason: "x" } });
          return row;
        })) as never);
      try {
        const res = await confirm(slip.id, owner).expect(409);
        expect(res.body.code).toBe("SLIP_ALREADY_REVIEWED");
      } finally {
        spy.mockRestore();
      }
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("REJECTED");
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    });

    // test ຂອງ race ລຸ່ມນີ້ຂຶ້ນກັບລຳດັບເອີ້ນ: findUnique ຄັ້ງທຳອິດຂອງ paymentSlip ໃນ confirm = requireRow ກ່ອນ transaction
    const afterFirstRead = (slipId: string, mutate: () => Promise<unknown>) => {
      const original = db.paymentSlip.findUnique.bind(db.paymentSlip) as (args: unknown) => Promise<unknown>;
      return vi.spyOn(db.paymentSlip, "findUnique").mockImplementationOnce(((args: unknown) =>
        original(args).then(async (row) => {
          await mutate();
          return row;
        })) as never);
    };

    it("PATCH ຂອງແອດມິນອື່ນລົງມາລະຫວ່າງອ່ານກັບ claim → ໃຊ້ຄ່າໃໝ່ (ບໍ່ຖືກທັບດ້ວຍ snapshot ເກົ່າ) ທັງໃນແຖວ ແລະ audit", async () => {
      const { slip } = await seedSlip();
      const owner = await as("OWNER");
      const spy = afterFirstRead(slip.id, () =>
        db.paymentSlip.update({ where: { id: slip.id }, data: { confirmedAmount: "777", confirmedRefNo: "NEW" } }),
      );
      try {
        await confirm(slip.id, owner).expect(200);
      } finally {
        spy.mockRestore();
      }
      const row = await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
      expect(row.confirmedAmount?.toFixed(2)).toBe("777.00");
      expect(row.confirmedRefNo).toBe("NEW");
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "slip.confirm", entityId: slip.id } });
      expect(audit.after).toMatchObject({ amount: "777.00" });
    });

    it("ຍອດຖືກລຶບ (null) ລະຫວ່າງອ່ານກັບ claim → 422 SLIP_AMOUNT_REQUIRED ແລະ rollback (ຍັງ READ, ບິນບໍ່ PAID)", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      const spy = afterFirstRead(slip.id, () => db.paymentSlip.update({ where: { id: slip.id }, data: { readAmount: null } }));
      try {
        const res = await confirm(slip.id, owner).expect(422);
        expect(res.body.code).toBe("SLIP_AMOUNT_REQUIRED");
      } finally {
        spy.mockRestore();
      }
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("READ");
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    });

    it("ສະລິບຖືກຍ້າຍໄປບິນອື່ນລະຫວ່າງອ່ານກັບ claim (ຍັງເປີດ) → 409 CONFLICT ບໍ່ແມ່ນ SLIP_ALREADY_REVIEWED; ບໍ່ pay ບິນໃດ", async () => {
      const { order, slip } = await seedSlip();
      const other = await makeOrder();
      const owner = await as("OWNER");
      const spy = afterFirstRead(slip.id, () => db.paymentSlip.update({ where: { id: slip.id }, data: { orderId: other.id } }));
      try {
        const res = await confirm(slip.id, owner).expect(409);
        expect(res.body.code).toBe("CONFLICT");
      } finally {
        spy.mockRestore();
      }
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("READ");
      for (const id of [order.id, other.id]) {
        expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_PAYMENT");
      }
    });

    it("ສອງສະລິບຄົນລະໃບຂອງບິນດຽວກັນ confirm ພ້ອມກັນ → ໃບດຽວ 200, ອີກໃບ 409 ORDER_INVALID_STATE ແລະ ບໍ່ຖືກ claim; ບິນ pay ຄັ້ງດຽວ", async () => {
      const { order, slip } = await seedSlip();
      const second = await db.paymentSlip.create({
        data: {
          source: "UPLOAD", orderId: order.id, imageKey: "slips/s2", imageMime: "image/png", imageBytes: 1,
          imageSha256: "e".repeat(64), status: "READ", readAmount: "100000", readCurrency: "LAK",
        },
      });
      const owner = await as("OWNER");
      const results = await Promise.all([confirm(slip.id, owner), confirm(second.id, owner)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)?.body.code).toBe("ORDER_INVALID_STATE");
      const rows = await db.paymentSlip.findMany({ where: { orderId: order.id } });
      expect(rows.filter((r) => r.status === "CONFIRMED")).toHaveLength(1);
      const loser = rows.find((r) => r.status !== "CONFIRMED");
      expect(loser?.status).toBe("READ");
      expect(loser?.confirmedAmount).toBeNull();
      expect(loser?.reviewedByUserId).toBeNull();
      expect(await db.auditLog.count({ where: { action: "order.pay", entityId: order.id } })).toBe(1);
    });

    it("order.pay audit ມີ slipId ແລະ slip.confirm ບັນທຶກຍອດ", async () => {
      const { order, slip } = await seedSlip();
      await confirm(slip.id, await as("OWNER")).expect(200);
      const pay = await db.auditLog.findFirstOrThrow({ where: { action: "order.pay", entityId: order.id } });
      expect(pay.after).toMatchObject({ status: "PAID", slipId: slip.id });
      const conf = await db.auditLog.findFirstOrThrow({ where: { action: "slip.confirm", entityId: slip.id } });
      expect(conf.after).toMatchObject({ orderId: order.id, amount: "100000.00" });
    });

    it("audit ລົ້ມຫຼັງ commit → ຍັງ 200 (ເງິນ/ບິນປ່ຽນແລ້ວ ບໍ່ຕອບ 500)", async () => {
      const { order, slip } = await seedSlip();
      const owner = await as("OWNER");
      const spy = vi.spyOn(db.auditLog, "create").mockRejectedValue(new Error("audit down: secret-payload"));
      const logSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
      try {
        await confirm(slip.id, owner).expect(200);
        // ຕ້ອງ log ການລົ້ມ (ມີ action + id) ແຕ່ບໍ່ຮົ່ວ message ດິບທີ່ອາດມີ payload
        const logged = logSpy.mock.calls.map((call) => String(call[0]));
        expect(logged.some((m) => m.includes("slip.confirm") && m.includes(slip.id))).toBe(true);
        expect(logged.join("\n")).not.toContain("secret-payload");
      } finally {
        spy.mockRestore();
        logSpy.mockRestore();
      }
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
      expect((await db.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } })).status).toBe("CONFIRMED");
    });

    it("ສະລິບທີ່ແອດມິນແກ້ບາງຄ່າ: ຄ່າທີ່ບໍ່ໄດ້ແກ້ຖືກເຕີມຈາກ read*", async () => {
      const { slip } = await seedSlip({ readRefNo: "RR", readDestAccount: "D1", confirmedRefNo: "EDITED" });
      const res = await confirm(slip.id, await as("OWNER")).expect(200);
      expect(res.body.confirmed).toMatchObject({ refNo: "EDITED", destAccount: "D1", currency: "LAK" });
    });
  });
});
