import { Controller, Get, Inject, Param, Post, Req, Res, UploadedFile, UseFilters, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MEDIA_MAX_BYTES } from "@oca/shared";
import type { Request, Response } from "express";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { CurrentUser, Public, RequirePermissions } from "../../common/decorators";
import { mimeTypeOfKey } from "../../common/storage/image-type";
import { StorageService, isStorageKey } from "../../common/storage/storage.service";
import { MediaUploadErrorFilter } from "./media-upload.filter";
import { MediaService, type UploadedMedia } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Post()
  @RequirePermissions("posting:write")
  @UseFilters(MediaUploadErrorFilter)
  // memory storage (default ເມື່ອບໍ່ຕັ້ງ dest); ເກີນ 1 byte ຈາກຂີດ = 413 → MEDIA_INVALID/SIZE
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MEDIA_MAX_BYTES, files: 1, fields: 0, parts: 1 } }))
  upload(@UploadedFile() file: UploadedMedia | undefined, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.media.upload(file, actor, req.ip);
  }

  /**
   * ເປີດສາທາລະນະ: key ສຸ່ມ 128 bit ເດົາບໍ່ໄດ້ (ຮູບການຕະຫຼາດ). ຂໍ້ມູນລັບຕ້ອງມີ route ທີ່ກວດສິດເອງ.
   * CORP cross-origin: admin ຢູ່ຄົນລະ origin ກັບ API (helmet ຕັ້ງ same-origin ເປັນ default).
   */
  @Get("files/:key")
  @Public()
  async file(@Param("key") key: string, @Res() res: Response): Promise<void> {
    const mimeType = isStorageKey(key) ? mimeTypeOfKey(key) : undefined;
    const data = mimeType ? await this.storage.read(key) : null;
    if (!mimeType || !data) throw apiError("MEDIA_NOT_FOUND", "File not found");
    res
      .status(200)
      .set({
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Security-Policy": "default-src 'none'",
      })
      .send(data);
  }
}
