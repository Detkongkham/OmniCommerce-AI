import type { Permission, ProductStatus } from "@oca/shared";

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
