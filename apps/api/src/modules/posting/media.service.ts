import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@oca/database";
import { MEDIA_MAX_BYTES } from "@oca/shared";
import { AuditService } from "../../audit/audit.service";
import { apiError } from "../../common/api-error";
import type { AuthUser } from "../../common/auth-types";
import { detectImageType } from "../../common/storage/image-type";
import { StorageService } from "../../common/storage/storage.service";
import { PRISMA } from "../../prisma/prisma.module";
import { type MediaFileDto, toMediaFileDto } from "./posting.mapper";

/** ໄຟລ໌ທີ່ multer ອ່ານເຂົ້າ memory (ສະເພາະ field ທີ່ໃຊ້) */
export interface UploadedMedia {
  buffer: Buffer;
  size: number;
  originalname: string;
}

const ORIGINAL_NAME_MAX = 200;

@Injectable()
export class MediaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async upload(file: UploadedMedia | undefined, actor: AuthUser, ip: string | undefined): Promise<MediaFileDto> {
    if (!file || file.size === 0) throw apiError("MEDIA_INVALID", "No file uploaded", { reason: "MISSING" });
    if (file.size > MEDIA_MAX_BYTES) throw apiError("MEDIA_INVALID", "File is too large", { reason: "SIZE" });
    const type = detectImageType(file.buffer);
    if (!type) throw apiError("MEDIA_INVALID", "Only JPEG, PNG and WebP images are allowed", { reason: "TYPE" });

    const key = this.storage.newKey(type.extension);
    await this.storage.put(key, file.buffer);
    try {
      const row = await this.prisma.mediaFile.create({
        data: {
          storageKey: key,
          mimeType: type.mimeType,
          size: file.size,
          originalName: sanitizeName(file.originalname),
          createdById: actor.id,
        },
      });
      await this.audit.record({ userId: actor.id, action: "media.upload", entity: "MediaFile", entityId: row.id, ip });
      return toMediaFileDto(row);
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
  }
}

/** multer ອ່ານຊື່ເປັນ latin1; ຕັດ control chars ແລະ path */
function sanitizeName(raw: string): string {
  const decoded = Buffer.from(raw, "latin1").toString("utf8");
  const base = decoded.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex -- ຕັດ control characters ອອກຈາກຊື່ໄຟລ໌
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "image").slice(0, ORIGINAL_NAME_MAX);
}
