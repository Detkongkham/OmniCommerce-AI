import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { COUNTED_ORDER_STATUSES, type PrismaClient, customerSpend12m, loadLoyaltyConfig } from "@oca/database";
import {
  MEMBER_PAGE_SIZE,
  MEMBER_PIN_LOCK_MINUTES,
  MEMBER_PIN_MAX_FAILURES,
  STORE_TOKEN_PATTERN,
  type StoreMemberLoginInput,
  type StoreMemberPageQuery,
} from "@oca/shared";
import { PasswordService } from "../../auth/password.service";
import { apiError } from "../../common/api-error";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { ENV, type Env } from "../../config/env";
import { PRISMA } from "../../prisma/prisma.module";
import {
  type StoreMemberDto,
  type StoreMemberOrderDto,
  type StoreMemberPointDto,
  type StoreMemberRow,
  storeMemberOrderSelect,
  storeMemberPointSelect,
  storeMemberSelect,
  toStoreMember,
  toStoreMemberOrder,
  toStoreMemberPoint,
} from "./store-member.mapper";

const MEMBER_AUDIENCE = "member";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOCK_MS = MEMBER_PIN_LOCK_MINUTES * 60_000;

export interface StoreMemberSessionDto {
  /** JWT 30 ວັນ: ສົ່ງກັບມາໃນ `Authorization: Bearer` */
  memberToken: string;
  member: StoreMemberDto;
}

interface PinRow {
  pinHash: string | null;
  pinFailedCount: number;
  pinLockedUntil: Date | null;
}

type LoginOutcome = { kind: "ok" } | { kind: "failed" } | { kind: "locked"; until: Date };

/** ສະມາຊິກເທິງເວັບ: ຕັ້ງ PIN ຈາກບິນທີ່ຈ່າຍແລ້ວ, ເຂົ້າລະບົບດ້ວຍເບີ + PIN, session ແບບ JWT ແລະ ຂໍ້ມູນບັນຊີ */
@Injectable()
export class StoreMemberService {
  private readonly secret: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(ENV) env: Env,
  ) {
    // ກະແຈແຍກຈາກ access token ຂອງພະນັກງານ (env ປະຕິເສດ MEMBER_JWT_SECRET ທີ່ຄືກັບ JWT_ACCESS_SECRET).
    // ຝັ່ງນີ້ຍັງກວດ audience "member" ນຳ; ຝັ່ງພະນັກງານອາໄສກະແຈຕ່າງກັນຢ່າງດຽວ (ບໍ່ກວດ audience)
    this.secret = env.MEMBER_JWT_SECRET ?? createHmac("sha256", env.JWT_ACCESS_SECRET).update("oca-member-session").digest("hex");
  }

  /**
   * ຕັ້ງ PIN ຄັ້ງທຳອິດດ້ວຍ token ຂອງບິນເວັບທີ່ຈ່າຍແລ້ວ (guest checkout ຮັບເບີໃດກໍ່ໄດ້ ຈຶ່ງຕ້ອງເປັນບິນທີ່ຈ່າຍແລ້ວ).
   * ຕັ້ງໄດ້ຄັ້ງດຽວ: ມີ PIN ແລ້ວ → 409 (ປ່ຽນ/ລືມ PIN ບໍ່ຜ່ານທາງນີ້).
   */
  async setPin(token: string, pin: string): Promise<StoreMemberSessionDto> {
    const order = STORE_TOKEN_PATTERN.test(token)
      ? await this.prisma.order.findUnique({ where: { publicToken: token }, select: { channel: true, status: true, customer: { select: { id: true, pinHash: true } } } })
      : null;
    if (!order) throw apiError("ORDER_NOT_FOUND", "Order not found");
    const customer = order.customer;
    if (order.channel !== "STOREFRONT" || !customer) {
      throw apiError("ORDER_INVALID_STATE", "A PIN can only be set from a storefront order that has a customer");
    }
    if (!(COUNTED_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      throw apiError("ORDER_INVALID_STATE", `Order is ${order.status}; a PIN can only be set from a paid order`, { status: order.status });
    }
    // ຕອບກ່ອນ hash (argon2 ແພງ); UPDATE ມີເງື່ອນໄຂລຸ່ມນີ້ຍັງເປັນດ່ານຈິງຂອງຄຳຂໍພ້ອມກັນ
    if (customer.pinHash) throw alreadySet();
    const pinHash = await this.passwords.hash(pin);
    // ເງື່ອນໄຂ pinHash IS NULL ຢູ່ໃນ UPDATE ດຽວ: ສອງຄຳຂໍພ້ອມກັນ ສຳເລັດອັນດຽວ
    const { count } = await this.prisma.customer.updateMany({
      where: { id: customer.id, pinHash: null },
      data: { pinHash, pinFailedCount: 0, pinLockedUntil: null },
    });
    if (count === 0) throw alreadySet();
    return this.session(customer.id);
  }

  /** ເບີບໍ່ມີ, ລູກຄ້າບໍ່ມີ PIN ແລະ PIN ຜິດ ຕອບຄືກັນ (401 MEMBER_LOGIN_FAILED) ແລະ ໃຊ້ເວລາໃກ້ກັນ */
  async login(input: StoreMemberLoginInput): Promise<StoreMemberSessionDto> {
    // ເບີບໍ່ຖືກ normalize: ຄືກັບ guest checkout ທີ່ຊອກ/ສ້າງລູກຄ້າດ້ວຍເບີຕາມທີ່ພິມ
    const customer = await this.prisma.customer.findUnique({
      where: { phone: input.phone },
      select: { id: true, pinHash: true, pinLockedUntil: true },
    });
    if (!customer?.pinHash) {
      await this.passwords.verifyDummy(input.pin);
      throw loginFailed();
    }
    if (customer.pinLockedUntil && customer.pinLockedUntil.getTime() > Date.now()) throw locked(customer.pinLockedUntil);

    const verifiedHash = customer.pinHash;
    const matches = await this.passwords.verify(verifiedHash, input.pin);
    // ລັອກແຖວ ແລ້ວຕັດສິນຈາກຄ່າຫຼ້າສຸດ: ຄຳຂໍພ້ອມກັນນັບຄົບທຸກຄັ້ງ ແລະ PIN ຖືກກໍ່ບໍ່ຜ່ານເມື່ອຖືກລັອກລະຫວ່າງທາງ.
    // ຄືນຜົນແທນການ throw ພາຍໃນ ເພື່ອບໍ່ໃຫ້ຕົວນັບຖືກ rollback
    const outcome = await this.prisma.$transaction(async (tx): Promise<LoginOutcome> => {
      const rows = await tx.$queryRaw<PinRow[]>`
        SELECT "pinHash", "pinFailedCount", "pinLockedUntil" FROM "Customer" WHERE "id" = ${customer.id} FOR UPDATE`;
      const row = rows[0];
      if (!row || row.pinHash !== verifiedHash) return { kind: "failed" };
      const now = Date.now();
      if (row.pinLockedUntil && row.pinLockedUntil.getTime() > now) return { kind: "locked", until: row.pinLockedUntil };
      if (matches) {
        if (row.pinFailedCount !== 0 || row.pinLockedUntil) {
          await tx.customer.update({ where: { id: customer.id }, data: { pinFailedCount: 0, pinLockedUntil: null } });
        }
        return { kind: "ok" };
      }
      if (row.pinFailedCount + 1 >= MEMBER_PIN_MAX_FAILURES) {
        const until = new Date(now + LOCK_MS);
        await tx.customer.update({ where: { id: customer.id }, data: { pinFailedCount: 0, pinLockedUntil: until } });
        return { kind: "locked", until };
      }
      await tx.customer.update({ where: { id: customer.id }, data: { pinFailedCount: row.pinFailedCount + 1, pinLockedUntil: null } });
      return { kind: "failed" };
    });
    if (outcome.kind === "locked") throw locked(outcome.until);
    if (outcome.kind === "failed") throw loginFailed();
    return this.session(customer.id);
  }

  /**
   * ລູກຄ້າຂອງ session ຈາກ header `Authorization: Bearer <memberToken>`.
   * ບໍ່ມີ/ຜິດ/ໝົດອາຍຸ, ລູກຄ້າຖືກລຶບ, PIN ຖືກລຶບ ຫຼື pinVersion ປ່ຽນ (reset) → 401 MEMBER_REQUIRED.
   */
  async requireMember(authorization: string | undefined): Promise<StoreMemberRow> {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    let payload: { sub?: unknown; pv?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.secret, algorithms: ["HS256"], audience: MEMBER_AUDIENCE });
    } catch {
      throw memberRequired();
    }
    if (typeof payload.sub !== "string" || typeof payload.pv !== "number") throw memberRequired();
    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.sub },
      select: { ...storeMemberSelect, pinHash: true, pinVersion: true },
    });
    if (!customer) throw memberRequired();
    const { pinHash, pinVersion, ...member } = customer;
    if (!pinHash || pinVersion !== payload.pv) throw memberRequired();
    return member;
  }

  /** ບໍ່ມີ header (undefined) = null (guest); ມີ header ແຕ່ໃຊ້ບໍ່ໄດ້ ລວມທັງຄ່າວ່າງ → 401 MEMBER_REQUIRED (ບໍ່ຕົກເປັນ guest ແບບງຽບໆ) */
  async optionalMember(authorization: string | undefined): Promise<StoreMemberRow | null> {
    if (authorization === undefined) return null;
    return this.requireMember(authorization);
  }

  /** DTO ຂອງ GET /store/member/me. ລະບົບແຕ້ມປິດ ກໍ່ຍັງຄືນຍອດ/ລະດັບ */
  async me(member: StoreMemberRow): Promise<StoreMemberDto> {
    const [spend12m, loyalty] = await Promise.all([customerSpend12m(this.prisma, member.id), loadLoyaltyConfig(this.prisma)]);
    return toStoreMember(member, spend12m, loyalty.tierRules);
  }

  /** ບິນຂອງລູກຄ້າທຸກຊ່ອງທາງ ໃໝ່ກ່ອນ */
  async orders(member: StoreMemberRow, query: StoreMemberPageQuery): Promise<Page<StoreMemberOrderDto>> {
    const where = { customerId: member.id };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, MEMBER_PAGE_SIZE),
        select: storeMemberOrderSelect,
      }),
      this.prisma.order.count({ where }),
    ]);
    return toPage(rows.map((row) => toStoreMemberOrder(row)), total, query.page, MEMBER_PAGE_SIZE);
  }

  /** ສະໝຸດແຕ້ມຂອງລູກຄ້າ ໃໝ່ກ່ອນ */
  async points(member: StoreMemberRow, query: StoreMemberPageQuery): Promise<Page<StoreMemberPointDto>> {
    const where = { customerId: member.id };
    const [rows, total] = await Promise.all([
      this.prisma.pointEntry.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, MEMBER_PAGE_SIZE),
        select: storeMemberPointSelect,
      }),
      this.prisma.pointEntry.count({ where }),
    ]);
    return toPage(rows.map(toStoreMemberPoint), total, query.page, MEMBER_PAGE_SIZE);
  }

  private async session(customerId: string): Promise<StoreMemberSessionDto> {
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { ...storeMemberSelect, pinVersion: true },
    });
    const { pinVersion, ...member } = customer;
    const memberToken = await this.jwt.signAsync(
      { pv: pinVersion },
      { subject: member.id, secret: this.secret, algorithm: "HS256", audience: MEMBER_AUDIENCE, expiresIn: SESSION_TTL_SECONDS },
    );
    return { memberToken, member: await this.me(member) };
  }
}

function loginFailed() {
  return apiError("MEMBER_LOGIN_FAILED", "Phone or PIN is incorrect");
}

function locked(until: Date) {
  const retryAfterSeconds = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  return apiError("MEMBER_LOCKED", "Too many failed attempts; try again later", { retryAfterSeconds });
}

function alreadySet() {
  return apiError("PIN_ALREADY_SET", "This customer already has a PIN");
}

function memberRequired() {
  return apiError("MEMBER_REQUIRED", "Member sign-in required");
}
