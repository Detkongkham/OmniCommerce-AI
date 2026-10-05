import { ORDER_STATUSES, type OrderStatus } from "@oca/shared";

type Raw = string | string[] | null | undefined;

function first(value: Raw): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** ແປງ ?q=&status= ຈາກ server searchParams ເປັນຄ່າທີ່ປອດໄພ (status ທີ່ບໍ່ຮູ້ຈັກ = ບໍ່ກັ່ນຕອງ). */
export function parseOrderSearchParams(params: { q?: Raw; status?: Raw }): { q: string; status: OrderStatus | "" } {
  const status = first(params.status);
  return {
    q: first(params.q).trim(),
    status: (ORDER_STATUSES as readonly string[]).includes(status) ? (status as OrderStatus) : "",
  };
}
