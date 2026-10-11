import type { CouponRejectReason, OrderStatus, ReceivingAccount, StoreSlipStatus, StoreStock, StoreStockStatus } from "@oca/shared";

/** ຮູບຮ່າງ response ຂອງ API ສາທາລະນະ `/store/*` (ກົງກັບ DTO ໃນ apps/api/src/modules/storefront) */

export interface StoreConfig {
  name: string;
  currency: string;
  reservationMinutes: number;
  paymentInstructions: string | null;
  receivingAccounts: ReceivingAccount[];
  couriers: { id: string; name: string }[];
}

export interface StoreCategory {
  name: string;
  slug: string;
  parentSlug: string | null;
}

export interface StoreProductListItem {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceMin: string;
  priceMax: string;
  compareAtPrice: string | null;
  /** ISO end time of the running flash sale; null = none */
  saleEndsAt: string | null;
  stock: StoreStockStatus;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StoreVariant {
  id: string;
  name: string | null;
  price: string;
  compareAtPrice: string | null;
  optionValues: Record<string, string>;
  saleEndsAt: string | null;
  stock: StoreStock;
}

export interface StoreProductImage {
  url: string;
  alt: string | null;
  variantId: string | null;
}

export interface StoreProductDetail {
  slug: string;
  name: string;
  description: string | null;
  category: { name: string; slug: string } | null;
  options: { name: string; values: string[] }[];
  variants: StoreVariant[];
  images: StoreProductImage[];
}

export interface StoreOrder {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  reservedUntil: string | null;
  paidAt: string | null;
  currency: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  coupon: { code: string; discount: string } | null;
  items: { variantId: string; productName: string; variantName: string | null; quantity: number; unitPrice: string; lineTotal: string }[];
  shipping: {
    name: string | null;
    phone: string | null;
    address: string | null;
    courierName: string | null;
    branch: string | null;
  };
  note: string | null;
  slips: { status: StoreSlipStatus; createdAt: string }[];
  tracking: { courierName: string | null; trackingNumber: string; url: string | null } | null;
}

export type StoreCartLine =
  | { variantId: string; quantity: number; unavailable: true }
  | {
      variantId: string;
      quantity: number;
      unavailable: false;
      productName: string;
      productSlug: string;
      variantName: string | null;
      imageUrl: string | null;
      unitPrice: string;
      lineTotal: string;
      stock: StoreStock;
      insufficient: boolean;
    };

export interface StoreCart {
  items: StoreCartLine[];
  coupon: { code: string; discount: string } | null;
  couponError: { reason: CouponRejectReason; minSubtotal?: string } | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  orderable: boolean;
}

export interface StoreOrderCreated {
  orderNumber: string;
  token: string;
}
