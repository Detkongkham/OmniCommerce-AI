import { Controller, Get, Inject, Param, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SLIP_MAX_BYTES } from "@oca/shared";
import type { Request, Response } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { type UploadedImage, SlipsService } from "./slips.service";

/**
 * ເບິ່ງ = orders:read; ອັບໂຫຼດ/ຜູກຈາກແຊັດ = orders:write (+inbox:write ສຳລັບແຊັດ);
 * ແກ້ຄ່າ/retry/ປະຕິເສດ/ຢືນຢັນ = payments:write (ຢືນຢັນເອີ້ນ pay ທີ່ຕ້ອງການສິດດຽວກັນ).
 */
@Controller()
export class SlipsController {
  constructor(@Inject(SlipsService) private readonly slips: SlipsService) {}

  @Post("orders/:id/slips")
  @RequirePermissions("orders:write")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: SLIP_MAX_BYTES, files: 1 } }))
  upload(
    @Param("id") id: string,
    @UploadedFile() file: UploadedImage | undefined,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.slips.upload(id, file, actor, req.ip);
  }

  @Get("orders/:id/slips")
  @RequirePermissions("orders:read")
  listForOrder(@Param("id") id: string) {
    return this.slips.listForOrder(id);
  }

  @Get("slips/:id")
  @RequirePermissions("orders:read")
  get(@Param("id") id: string) {
    return this.slips.get(id);
  }

  /** ຮູບຜ່ານ API ເພື່ອກວດສິດ (ບໍ່ເປີດ public) */
  @Get("slips/:id/image")
  @RequirePermissions("orders:read")
  async image(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const { bytes, mime } = await this.slips.readImage(id);
    res.set({
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    res.end(Buffer.from(bytes));
  }
}
