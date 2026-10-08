import type { LiveSessionStatus, MediaFile, Prisma, SocialPostStatus } from "@oca/database";
import { facebookPermalink } from "@oca/shared";

export const MEDIA_FILE_PATH_PREFIX = "/media/files/";

export interface MediaFileDto {
  id: string;
  /** path ຂອງ API (ຕໍ່ທ້າຍ base URL ຂອງ API) */
  path: string;
  mimeType: string;
  size: number;
  originalName: string;
}

export function mediaPathOf(storageKey: string): string {
  return `${MEDIA_FILE_PATH_PREFIX}${storageKey}`;
}

export function toMediaFileDto(row: MediaFile): MediaFileDto {
  return { id: row.id, path: mediaPathOf(row.storageKey), mimeType: row.mimeType, size: row.size, originalName: row.originalName };
}

export const POST_INCLUDE = {
  media: { orderBy: { position: "asc" }, include: { mediaFile: { select: { storageKey: true } } } },
  liveSession: { select: { id: true, title: true, status: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SocialPostInclude;

export type PostRow = Prisma.SocialPostGetPayload<{ include: typeof POST_INCLUDE }>;

export interface SocialPostMediaDto {
  id: string;
  position: number;
  mediaFileId: string | null;
  /** path ຂອງໄຟລ໌ທີ່ອັບໂຫຼດ (ຕໍ່ທ້າຍ base URL ຂອງ API) ຫຼື URL ພາຍນອກ */
  url: string;
}

export interface SocialPostDto {
  id: string;
  message: string;
  status: SocialPostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  permalinkUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  cfLinkError: string | null;
  liveSession: { id: string; title: string; status: LiveSessionStatus } | null;
  media: SocialPostMediaDto[];
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export function toSocialPostDto(row: PostRow): SocialPostDto {
  return {
    id: row.id,
    message: row.message,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    externalPostId: row.externalPostId,
    permalinkUrl: row.externalPostId ? facebookPermalink(row.externalPostId) : null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    cfLinkError: row.cfLinkError,
    liveSession: row.liveSession,
    media: row.media.map((item) => ({
      id: item.id,
      position: item.position,
      mediaFileId: item.mediaFileId,
      url: item.mediaFile ? mediaPathOf(item.mediaFile.storageKey) : (item.url ?? ""),
    })),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
