import { Body, Controller, Get, Inject, Param, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { type LinkChatSlipInput, SLIP_MAX_BYTES, linkChatSlipSchema } from "@oca/shared";
import type { Request, Response } from "express";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
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

  @Post("conversations/:id/messages/:mid/slips")
  @RequirePermissions("orders:write", "inbox:write")
  linkFromChat(
    @Param("id") conversationId: string,
    @Param("mid") messageId: string,
    @Body(new ZodValidationPipe(linkChatSlipSchema)) body: LinkChatSlipInput,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.slips.linkFromChat(conversationId, messageId, body, actor, req.ip);
  }

  @Get("conversations/:id/slips")
  @RequirePermissions("orders:read")
  listForConversation(@Param("id") conversationId: string) {
    return this.slips.listForConversation(conversationId);
  }

  @Get("slips/:id")
  @RequirePermissions("orders:read")
  get(@Param("id") id: string) {
    return this.slips.get(id);
  }

  /**
   * ຮູບຜ່ານ API ເພື່ອກວດສິດ (ບໍ່ເປີດ public).
   * ໃຊ້ @Res() + res.end ແທນ StreamableFile ເພາະ storage ຄືນ buffer ທັງກ້ອນຢູ່ແລ້ວ (ຮູບນ້ອຍ) ແລະ ຕ້ອງຄວບຄຸມ header ຄົບ
   * (ທີ່ throw ກ່ອນ res.set ຍັງຜ່ານ exception filter ປົກກະຕິ).
   */
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
      // ກັນຮູບທີ່ຖືກເປີດເປັນເອກະສານ: ບໍ່ໃຫ້ໂຫຼດ/ຣັນຫຍັງ
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    // view ຂອງ buffer ເດີມ ບໍ່ copy
    res.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
  }
}
