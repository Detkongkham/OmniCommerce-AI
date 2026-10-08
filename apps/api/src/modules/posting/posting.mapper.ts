import type { MediaFile } from "@oca/database";

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
