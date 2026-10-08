import type { Prisma } from "@oca/database";
import { type ShipmentNotifyStatus, buildTrackingUrl } from "@oca/shared";

export interface CourierDto {
  id: string;
  code: string;
  name: string;
  trackingUrlTemplate: string | null;
  isActive: boolean;
  createdAt: Date;
}

type CourierRow = Prisma.CourierGetPayload<object>;

export function toCourierDto(row: CourierRow): CourierDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    trackingUrlTemplate: row.trackingUrlTemplate,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

const userName = { select: { id: true, name: true } } as const;

export const SHIPMENT_INCLUDE = {
  courier: true,
  packedBy: userName,
  verifiedBy: userName,
  shippedBy: userName,
} as const satisfies Prisma.ShipmentInclude;

type ShipmentRow = Prisma.ShipmentGetPayload<{ include: typeof SHIPMENT_INCLUDE }>;

export interface ShipmentDto {
  id: string;
  courier: { id: string; code: string; name: string } | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  packedBy: { id: string; name: string } | null;
  packedAt: Date | null;
  verifiedAt: Date | null;
  verifiedBy: { id: string; name: string } | null;
  verifyOverrideReason: string | null;
  shippedBy: { id: string; name: string } | null;
  shippedAt: Date | null;
  notifyStatus: ShipmentNotifyStatus;
  notifyErrorCode: string | null;
  notifiedAt: Date | null;
}

export function toShipmentDto(row: ShipmentRow): ShipmentDto {
  return {
    id: row.id,
    courier: row.courier ? { id: row.courier.id, code: row.courier.code, name: row.courier.name } : null,
    trackingNumber: row.trackingNumber,
    trackingUrl: row.trackingNumber ? buildTrackingUrl(row.courier?.trackingUrlTemplate, row.trackingNumber) : null,
    packedBy: row.packedBy,
    packedAt: row.packedAt,
    verifiedAt: row.verifiedAt,
    verifiedBy: row.verifiedBy,
    verifyOverrideReason: row.verifyOverrideReason,
    shippedBy: row.shippedBy,
    shippedAt: row.shippedAt,
    notifyStatus: row.notifyStatus,
    notifyErrorCode: row.notifyErrorCode,
    notifiedAt: row.notifiedAt,
  };
}
