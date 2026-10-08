import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import type {
  CreateLiveItemInput,
  CreateLiveSessionInput,
  LiveSessionListQuery,
  SetFeaturedInput,
  UpdateLiveItemInput,
  UpdateLiveSessionInput,
} from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { type Page, pageArgs, toPage } from "../../common/pagination";
import { isCheckViolation, isUniqueViolation } from "../../common/prisma-errors";
import { PRISMA } from "../../prisma/prisma.module";
import {
  ITEM_INCLUDE,
  type LiveItemDto,
  type LiveSessionDetailDto,
  type LiveSessionDto,
  SESSION_DETAIL_INCLUDE,
  SESSION_INCLUDE,
  toItemDto,
  toSessionDetailDto,
  toSessionDto,
} from "./live-cf.mapper";
import { CfIngestService } from "./cf-ingest.service";
import { LiveEventsService } from "./live-events.service";

@Injectable()
export class LiveSessionsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CfIngestService) private readonly ingest: CfIngestService,
    @Inject(LiveEventsService) private readonly events: LiveEventsService,
  ) {}

  async list(query: LiveSessionListQuery): Promise<Page<LiveSessionDto>> {
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.liveSession.findMany({
        where,
        include: SESSION_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pageArgs(query.page, query.pageSize),
      }),
      this.prisma.liveSession.count({ where }),
    ]);
    return toPage(rows.map(toSessionDto), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<LiveSessionDetailDto> {
    const row = await this.prisma.liveSession.findUnique({ where: { id }, include: SESSION_DETAIL_INCLUDE });
    if (!row) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
    return toSessionDetailDto(row);
  }

  async create(input: CreateLiveSessionInput, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const row = await this.prisma.liveSession.create({
      data: {
        title: input.title,
        kind: input.kind,
        externalPostId: input.externalPostId ?? null,
        publicReplyEnabled: input.publicReplyEnabled,
        createdById: actor.id,
      },
      select: { id: true },
    });
    await this.audit.record({ userId: actor.id, action: "live.create", entity: "LiveSession", entityId: row.id, after: { title: input.title, kind: input.kind }, ip });
    return this.get(row.id);
  }

  async update(id: string, input: UpdateLiveSessionInput, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const session = await this.requireSession(id);
    // ຕອນ LIVE ຫ້າມປ່ຽນ/ລ້າງ externalPostId; ຄ່າເທົ່າເກົ່າ (ຟອມເຕັມ) ຜ່ານໄດ້
    if (session.status === "LIVE" && input.externalPostId !== undefined && input.externalPostId !== session.externalPostId) {
      throw apiError(
        "LIVE_SESSION_INVALID_STATE",
        input.externalPostId === null
          ? "externalPostId cannot be cleared while the session is live"
          : "externalPostId cannot be changed while the session is live",
      );
    }
    await this.prisma.liveSession.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.externalPostId !== undefined ? { externalPostId: input.externalPostId } : {}),
        ...(input.publicReplyEnabled !== undefined ? { publicReplyEnabled: input.publicReplyEnabled } : {}),
      },
    });
    if (session.status === "LIVE" && session.externalPostId) this.ingest.invalidate(session.externalPostId);
    await this.audit.record({ userId: actor.id, action: "live.update", entity: "LiveSession", entityId: id, after: { ...input }, ip });
    await this.events.sessionUpdated(id);
    return this.get(id);
  }

  async start(id: string, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const session = await this.requireSession(id);
    if (session.status !== "DRAFT") {
      throw apiError("LIVE_SESSION_INVALID_STATE", `Session is ${session.status}; only DRAFT sessions can start`, { status: session.status });
    }
    if (!session.externalPostId) throw apiError("BAD_REQUEST", "externalPostId is required to start a session");
    if (session._count.items === 0) throw apiError("BAD_REQUEST", "Add at least one CF code before starting");
    try {
      const { count } = await this.prisma.liveSession.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "LIVE", startedAt: new Date() },
      });
      if (count === 0) throw apiError("LIVE_SESSION_INVALID_STATE", "Session is no longer a draft");
    } catch (error) {
      // partial unique index: ມີ session LIVE ອື່ນໃຊ້ໂພສນີ້ຢູ່
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "Another live session is already using this post", { fields: ["externalPostId"] });
      throw error;
    }
    this.ingest.invalidate(session.externalPostId);
    await this.audit.record({ userId: actor.id, action: "live.start", entity: "LiveSession", entityId: id, ip });
    await this.events.sessionUpdated(id);
    return this.get(id);
  }

  async end(id: string, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const session = await this.requireSession(id);
    const { count } = await this.prisma.liveSession.updateMany({
      where: { id, status: "LIVE" },
      data: { status: "ENDED", endedAt: new Date() },
    });
    if (count === 0) {
      throw apiError("LIVE_SESSION_INVALID_STATE", `Session is ${session.status}; only LIVE sessions can end`, { status: session.status });
    }
    if (session.externalPostId) this.ingest.invalidate(session.externalPostId);
    await this.audit.record({ userId: actor.id, action: "live.end", entity: "LiveSession", entityId: id, ip });
    await this.events.sessionUpdated(id);
    return this.get(id);
  }

  async addItem(sessionId: string, input: CreateLiveItemInput): Promise<LiveItemDto> {
    const session = await this.requireSession(sessionId);
    if (session.status === "ENDED") throw apiError("LIVE_SESSION_INVALID_STATE", "Session has ended");
    await this.requireSellableVariant(input.variantId);
    try {
      const row = await this.prisma.liveSessionItem.create({
        data: { sessionId, code: input.code, variantId: input.variantId, limit: input.limit ?? null },
        include: ITEM_INCLUDE,
      });
      await this.events.sessionUpdated(sessionId);
      return toItemDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError("DUPLICATE_VALUE", "This code already exists in the session", { fields: ["code"] });
      throw error;
    }
  }

  async updateItem(sessionId: string, itemId: string, input: UpdateLiveItemInput): Promise<LiveItemDto> {
    const session = await this.requireSession(sessionId);
    if (session.status === "ENDED") throw apiError("LIVE_SESSION_INVALID_STATE", "Session has ended");
    const item = await this.requireItem(sessionId, itemId);
    if (input.variantId !== undefined && input.variantId !== item.variantId) {
      if (item.claimed > 0) throw apiError("LIVE_ITEM_IN_USE", "This code already has CF orders; its product cannot change");
      await this.requireSellableVariant(input.variantId);
    }
    if (input.limit !== undefined && input.limit !== null && input.limit < item.claimed) {
      throw apiError("LIVE_ITEM_IN_USE", "The limit cannot be lower than the quantity already claimed", { claimed: item.claimed });
    }
    const data = {
      ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    };
    // guard ໃນ WHERE: claimed ຕ້ອງບໍ່ເກີນ limit ໃໝ່ / ຍັງເປັນ 0 ຖ້າປ່ຽນສິນຄ້າ (ປອດໄພເມື່ອມີ CF ເຂົ້າມາພ້ອມກັນ)
    const changesVariant = input.variantId !== undefined && input.variantId !== item.variantId;
    const guard = {
      id: itemId,
      sessionId,
      ...(changesVariant ? { claimed: 0 } : {}),
      ...(typeof input.limit === "number" ? { claimed: changesVariant ? 0 : { lte: input.limit } } : {}),
    };
    try {
      const { count } = await this.prisma.liveSessionItem.updateMany({ where: guard, data });
      if (count === 0) {
        const exists = await this.prisma.liveSessionItem.findFirst({ where: { id: itemId, sessionId }, select: { id: true } });
        if (!exists) throw apiError("LIVE_ITEM_NOT_FOUND", "CF code not found");
        throw apiError("LIVE_ITEM_IN_USE", "This code already has CF orders; the change conflicts with the quantity claimed");
      }
    } catch (error) {
      // CHECK claimed <= limit ທີ່ຍັງຫຼຸດມາ (ແຂ່ງກັນ) → ແປງເປັນ 409 ແທນ 500
      if (isCheckViolation(error)) throw apiError("LIVE_ITEM_IN_USE", "The limit cannot be lower than the quantity already claimed");
      throw error;
    }
    const row = await this.prisma.liveSessionItem.findUniqueOrThrow({ where: { id: itemId }, include: ITEM_INCLUDE });
    await this.events.sessionUpdated(sessionId);
    return toItemDto(row);
  }

  async removeItem(sessionId: string, itemId: string): Promise<void> {
    const session = await this.requireSession(sessionId);
    if (session.status === "ENDED") throw apiError("LIVE_SESSION_INVALID_STATE", "Session has ended");
    const item = await this.requireItem(sessionId, itemId);
    if (item.claimed > 0) throw apiError("LIVE_ITEM_IN_USE", "This code already has CF orders and cannot be removed");
    // ເງື່ອນໄຂ claimed=0 ໃນ WHERE: ແຂ່ງກັບ CF ທີ່ເຂົ້າມາພ້ອມກັນໄດ້ຢ່າງປອດໄພ
    const { count } = await this.prisma.liveSessionItem.deleteMany({ where: { id: itemId, claimed: 0 } });
    if (count === 0) throw apiError("LIVE_ITEM_IN_USE", "This code already has CF orders and cannot be removed");
    await this.events.sessionUpdated(sessionId);
  }

  /** ຕັ້ງ/ລ້າງສິນຄ້າທີ່ກຳລັງນຳສະເໜີ (Host screen); item ຕ້ອງເປັນຂອງ session ນີ້ */
  async setFeatured(id: string, input: SetFeaturedInput, actor: AuthUser, ip: string | undefined): Promise<LiveSessionDetailDto> {
    const session = await this.requireSession(id);
    if (session.status === "ENDED") throw apiError("LIVE_SESSION_INVALID_STATE", "Session has ended");
    if (input.itemId !== null) await this.requireItem(id, input.itemId);
    await this.prisma.liveSession.update({ where: { id }, data: { featuredItemId: input.itemId } });
    await this.audit.record({ userId: actor.id, action: "live.feature", entity: "LiveSession", entityId: id, after: { itemId: input.itemId }, ip });
    await this.events.sessionUpdated(id);
    return this.get(id);
  }

  async requireSession(id: string) {
    const row = await this.prisma.liveSession.findUnique({ where: { id }, include: SESSION_INCLUDE });
    if (!row) throw apiError("LIVE_SESSION_NOT_FOUND", "Live session not found");
    return row;
  }

  private async requireItem(sessionId: string, itemId: string) {
    const item = await this.prisma.liveSessionItem.findFirst({ where: { id: itemId, sessionId } });
    if (!item) throw apiError("LIVE_ITEM_NOT_FOUND", "CF code not found");
    return item;
  }

  private async requireSellableVariant(variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { sku: true, isActive: true, product: { select: { status: true } } },
    });
    if (!variant) throw apiError("VARIANT_NOT_FOUND", `Variant ${variantId} not found`);
    if (!variant.isActive || variant.product.status !== "ACTIVE") {
      throw apiError("VARIANT_NOT_AVAILABLE", `Variant ${variant.sku} is not available for sale`, { sku: variant.sku });
    }
  }
}
