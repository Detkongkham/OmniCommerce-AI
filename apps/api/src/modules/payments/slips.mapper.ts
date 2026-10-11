import type { Prisma } from "@oca/database";
import { moneyOrNull } from "../../common/money";

export const slipInclude = {
  reviewedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.PaymentSlipInclude;

export type SlipRow = Prisma.PaymentSlipGetPayload<{ include: typeof slipInclude }>;

export interface SlipValuesDto {
  amount: string | null;
  currency: string | null;
  paidAt: Date | null;
  destAccount: string | null;
  refNo: string | null;
}

export interface SlipDto {
  id: string;
  orderId: string | null;
  conversationId: string | null;
  messageId: string | null;
  attachmentIndex: number | null;
  source: string;
  status: string;
  imageMime: string;
  imageBytes: number;
  readerName: string | null;
  readerVersion: string | null;
  /** ຄ່າທີ່ເຄື່ອງອ່ານ */
  read: SlipValuesDto;
  /** ຄ່າທີ່ແອດມິນແກ້/ຢືນຢັນ */
  confirmed: SlipValuesDto;
  flags: string[];
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
}

/** ບໍ່ສົ່ງ imageKey (ພາຍໃນ) ແລະ readRaw (ບໍ່ເຊື່ອຖື) ອອກໄປ */
export function toSlipDto(row: SlipRow): SlipDto {
  return {
    id: row.id,
    orderId: row.orderId,
    conversationId: row.conversationId,
    messageId: row.messageId,
    attachmentIndex: row.attachmentIndex,
    source: row.source,
    status: row.status,
    imageMime: row.imageMime,
    imageBytes: row.imageBytes,
    readerName: row.readerName,
    readerVersion: row.readerVersion,
    read: {
      amount: moneyOrNull(row.readAmount),
      currency: row.readCurrency,
      paidAt: row.readPaidAt,
      destAccount: row.readDestAccount,
      refNo: row.readRefNo,
    },
    confirmed: {
      amount: moneyOrNull(row.confirmedAmount),
      currency: row.confirmedCurrency,
      paidAt: row.confirmedPaidAt,
      destAccount: row.confirmedDestAccount,
      refNo: row.confirmedRefNo,
    },
    flags: row.flags,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
  };
}
