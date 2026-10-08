import type { MediaMimeType } from "@oca/shared";

export interface ImageType {
  mimeType: MediaMimeType;
  extension: "jpg" | "png" | "webp";
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** ປະເພດຮູບຈາກ magic bytes (ບໍ່ເຊື່ອ mimetype/ນາມສະກຸນທີ່ client ສົ່ງ); ບໍ່ຮອງຮັບ = null */
export function detectImageType(data: Buffer): ImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (data.length >= PNG_SIGNATURE.length && data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (data.length >= 12 && data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}

const MIME_BY_EXTENSION: Record<string, MediaMimeType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function mimeTypeOfKey(key: string): MediaMimeType | undefined {
  return MIME_BY_EXTENSION[key.slice(key.lastIndexOf(".") + 1)];
}
