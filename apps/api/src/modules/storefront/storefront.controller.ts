import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  SLIP_MAX_BYTES,
  type StoreCartCheckInput,
  type StoreCreateOrderInput,
  type StoreMemberLoginInput,
  type StoreMemberPageQuery,
  type StoreProductListQuery,
  type StoreSetPinInput,
  storeCartCheckSchema,
  storeCreateOrderSchema,
  storeMemberLoginSchema,
  storeMemberPageQuerySchema,
  storeProductListQuerySchema,
  storeSetPinSchema,
} from "@oca/shared";
import type { Request } from "express";
import { Public } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ENV, type Env } from "../../config/env";
import type { UploadedImage } from "../payments/slips.service";
import { StoreCatalogService } from "./store-catalog.service";
import { StoreMemberService } from "./store-member.service";
import { StoreOrdersService } from "./store-orders.service";
import { StoreRateLimiter } from "./store-rate-limiter";

const MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 10 * MINUTE_MS;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,128}$/;

/** ບັງຄັບ (ຕ່າງຈາກ POST /orders): ລູກຄ້າກົດຊ້ຳ/ເນັດຫຼຸດ ຕ້ອງບໍ່ໄດ້ສອງບິນ */
function requireIdempotencyKey(value: string | undefined): string {
  if (value === undefined || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new BadRequestException("Idempotency-Key header is required: 1-128 printable ASCII characters without spaces");
  }
  return value;
}

function clientOf(req: Request): string {
  return req.ip ?? "unknown";
}

/**
 * ໜ້າຮ້ານສາທາລະນະ: ທຸກ route ບໍ່ຕ້ອງ login. GET ບໍ່ຖືກຈຳກັດຄວາມຖີ່ທີ່ນີ້ (ເວັບ render ຝັ່ງ server
 * ຈຶ່ງມາຈາກ IP ດຽວ ແລະ ມີ cache); POST ຖືກຈຳກັດຕໍ່ IP.
 */
@Public()
@Controller("store")
export class StorefrontController {
  constructor(
    @Inject(StoreCatalogService) private readonly catalog: StoreCatalogService,
    @Inject(StoreOrdersService) private readonly orders: StoreOrdersService,
    @Inject(StoreMemberService) private readonly members: StoreMemberService,
    @Inject(StoreRateLimiter) private readonly limiter: StoreRateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("config")
  config() {
    return this.catalog.config();
  }

  @Get("categories")
  categories() {
    return this.catalog.categories();
  }

  @Get("products")
  products(@Query(new ZodValidationPipe(storeProductListQuerySchema)) query: StoreProductListQuery) {
    return this.catalog.products(query);
  }

  @Get("products/:slug")
  product(@Param("slug") slug: string) {
    return this.catalog.product(slug);
  }

  @Post("cart/check")
  @HttpCode(200)
  cartCheck(@Body(new ZodValidationPipe(storeCartCheckSchema)) body: StoreCartCheckInput, @Req() req: Request) {
    this.limiter.hit(`check:${clientOf(req)}`, this.env.STORE_CHECK_RATE_LIMIT, MINUTE_MS);
    return this.catalog.cartCheck(body);
  }

  @Post("orders")
  @Header("Cache-Control", "no-store")
  createOrder(
    @Body(new ZodValidationPipe(storeCreateOrderSchema)) body: StoreCreateOrderInput,
    @Req() req: Request,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    this.limiter.hit(`order:${clientOf(req)}`, this.env.STORE_ORDER_RATE_LIMIT, TEN_MINUTES_MS);
    return this.orders.create(body, req.ip, key);
  }

  @Get("orders/:token")
  @Header("Cache-Control", "no-store")
  order(@Param("token") token: string) {
    return this.orders.get(token);
  }

  @Post("orders/:token/slips")
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: SLIP_MAX_BYTES, files: 1 } }))
  uploadSlip(@Param("token") token: string, @UploadedFile() file: UploadedImage | undefined, @Req() req: Request) {
    this.limiter.hit(`slip:${clientOf(req)}`, this.env.STORE_SLIP_RATE_LIMIT, TEN_MINUTES_MS);
    return this.orders.uploadSlip(token, file, req.ip);
  }

  // ເຂົ້າລະບົບ ແລະ ຕັ້ງ PIN ນັບລວມກັນຕໍ່ IP (ທັງສອງເປັນຊ່ອງເດົາ PIN/token)
  @Post("orders/:token/pin")
  @Header("Cache-Control", "no-store")
  setPin(@Param("token") token: string, @Body(new ZodValidationPipe(storeSetPinSchema)) body: StoreSetPinInput, @Req() req: Request) {
    this.limiter.hit(`member:${clientOf(req)}`, this.env.STORE_LOGIN_RATE_LIMIT, TEN_MINUTES_MS);
    return this.members.setPin(token, body.pin);
  }

  @Post("member/login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  memberLogin(@Body(new ZodValidationPipe(storeMemberLoginSchema)) body: StoreMemberLoginInput, @Req() req: Request) {
    this.limiter.hit(`member:${clientOf(req)}`, this.env.STORE_LOGIN_RATE_LIMIT, TEN_MINUTES_MS);
    return this.members.login(body);
  }

  @Get("member/me")
  @Header("Cache-Control", "no-store")
  async memberMe(@Headers("authorization") authorization?: string) {
    return this.members.me(await this.members.requireMember(authorization));
  }

  @Get("member/orders")
  @Header("Cache-Control", "no-store")
  async memberOrders(
    @Query(new ZodValidationPipe(storeMemberPageQuerySchema)) query: StoreMemberPageQuery,
    @Headers("authorization") authorization?: string,
  ) {
    return this.members.orders(await this.members.requireMember(authorization), query);
  }

  @Get("member/points")
  @Header("Cache-Control", "no-store")
  async memberPoints(
    @Query(new ZodValidationPipe(storeMemberPageQuerySchema)) query: StoreMemberPageQuery,
    @Headers("authorization") authorization?: string,
  ) {
    return this.members.points(await this.members.requireMember(authorization), query);
  }
}
