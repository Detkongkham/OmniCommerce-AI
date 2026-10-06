import type {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  OrderStatus,
  Permission,
  ProductStatus,
  SalesChannel,
  StockMovementType,
} from "@oca/shared";

export interface StaffDto {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roleId: string;
  roleName: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
}

/** ຮູບ response ຂອງລາຍການທີ່ແບ່ງໜ້າຝັ່ງ API (spec §5) */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  productCount: number;
}

export interface StoreSettingsDto {
  name: string;
  baseCurrency: string;
  /** string ສອງທົດສະນິຍົມ ("7.00") */
  vatRate: string;
  pricesIncludeVat: boolean;
  reservationMinutes: number;
}

export interface ProductListItemDto {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  category: { id: string; name: string } | null;
  imageUrl: string | null;
  variantCount: number;
  priceMin: string | null;
  priceMax: string | null;
  availableTotal: number;
}

export interface StockCellDto {
  warehouseId: string;
  onHand: number;
  reserved: number;
  available: number;
}

export interface VariantDto {
  id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  price: string;
  compareAtPrice: string | null;
  /** ບໍ່ມີເມື່ອຜູ້ໃຊ້ບໍ່ມີ costs:read */
  costPrice?: string;
  weightGrams: number | null;
  isActive: boolean;
  optionValues: Record<string, string>;
  stock: StockCellDto[];
}

export interface ProductDetailDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  categoryId: string | null;
  options: { id: string; name: string; position: number; values: { id: string; value: string; position: number }[] }[];
  variants: VariantDto[];
  images: { id: string; url: string; alt: string | null; position: number; variantId: string | null }[];
}

/** ຜົນຂອງ GET /variants (ຄົ້ນຫາ variant ພ້ອມລາຄາ ແລະ ສະຕ໋ອກ) */
export interface VariantSearchItemDto {
  id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  productId: string;
  productName: string;
  productStatus: ProductStatus;
  imageUrl: string | null;
  price: string;
  costPrice?: string;
  isActive: boolean;
  availableTotal: number;
  stock: StockCellDto[];
}

export interface StockLevelDto {
  id: string;
  variantId: string;
  sku: string;
  variantName: string | null;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number | null;
  isLow: boolean;
}

export interface StockMovementDto {
  id: string;
  type: StockMovementType;
  quantity: number;
  variantId: string;
  sku: string;
  warehouseId: string;
  warehouseCode: string;
  orderId: string | null;
  orderNumber: string | null;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

/** ສ່ວນຂອງ body 409 INSUFFICIENT_STOCK */
export interface Shortage {
  variantId: string;
  warehouseId: string;
  sku: string | null;
  requested: number;
  available: number;
}

export interface CustomerDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  channel: SalesChannel;
  source: string;
  /** ບິນທີ່ເປີດຈາກແຊັດ (optional ເພື່ອບໍ່ແຕະ fixture ເກົ່າ; API ສົ່ງສະເໝີ) */
  conversationId?: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  total: string;
  itemCount: number;
  reservedUntil: string | null;
  createdAt: string;
}

export interface OrderItemDto {
  id: string;
  variantId: string;
  warehouseId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  unitPrice: string;
  /** ບໍ່ມີເມື່ອຜູ້ໃຊ້ບໍ່ມີ costs:read */
  unitCost?: string;
  quantity: number;
  discount: string;
  lineTotal: string;
}

export interface OrderMovementDto {
  id: string;
  type: StockMovementType;
  quantity: number;
  variantId: string;
  sku: string;
  warehouseId: string;
  warehouseCode: string;
  createdAt: string;
}

export interface OrderDetailDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  channel: SalesChannel;
  source: string;
  conversationId?: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  currency: string;
  exchangeRate: string;
  subtotal: string;
  discountTotal: string;
  shippingFee: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddress: string | null;
  note: string | null;
  reservedUntil: string | null;
  secondsUntilExpiry: number | null;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: OrderItemDto[];
  movements: OrderMovementDto[];
}

// ---------------------------------------------------------------------------
// Inbox (ກົງກັບ DTO ຂອງ apps/api/src/modules/inbox/inbox.mapper.ts)
// ---------------------------------------------------------------------------
export interface ConversationDto {
  id: string;
  channel: SalesChannel;
  displayName: string;
  status: ConversationStatus;
  unreadCount: number;
  lastMessageAt: string;
  /** null = ຂໍ້ຄວາມສຸດທ້າຍມີແຕ່ໄຟລ໌ແນບ */
  lastMessagePreview: string | null;
  assignee: { id: string; name: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  direction: MessageDirection;
  text: string | null;
  attachments: { type: string; url: string | null }[];
  status: MessageStatus;
  /** ຄ່າຈາກ MESSAGE_SEND_ERRORS ເມື່ອ status = FAILED (ໃຊ້ isMessageSendError ກ່ອນແປ) */
  errorCode: string | null;
  sentBy: { id: string; name: string } | null;
  createdAt: string;
}

/** ໃໝ່ສຸດກ່ອນ; ໜ້າຖັດໄປໃຊ້ id ຂອງແຖວສຸດທ້າຍເປັນ `beforeId` */
export interface MessagePage {
  items: MessageDto[];
  hasMore: boolean;
}

export interface AssigneeDto {
  id: string;
  name: string;
}
