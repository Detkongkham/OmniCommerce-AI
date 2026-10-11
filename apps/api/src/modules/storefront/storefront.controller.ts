import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import {
  type StoreCartCheckInput,
  type StoreProductListQuery,
  storeCartCheckSchema,
  storeProductListQuerySchema,
} from "@oca/shared";
import type { Request } from "express";
import { Public } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ENV, type Env } from "../../config/env";
import { StoreCatalogService } from "./store-catalog.service";
import { StoreRateLimiter } from "./store-rate-limiter";

const MINUTE_MS = 60_000;

/**
 * ໜ້າຮ້ານສາທາລະນະ: ທຸກ route ບໍ່ຕ້ອງ login. GET ບໍ່ຖືກຈຳກັດຄວາມຖີ່ທີ່ນີ້ (ເວັບ render ຝັ່ງ server
 * ຈຶ່ງມາຈາກ IP ດຽວ ແລະ ມີ cache); POST ຖືກຈຳກັດຕໍ່ IP.
 */
@Public()
@Controller("store")
export class StorefrontController {
  constructor(
    @Inject(StoreCatalogService) private readonly catalog: StoreCatalogService,
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
}

function clientOf(req: Request): string {
  return req.ip ?? "unknown";
}
