import type { StoreStock } from "@oca/shared";
import { StatusPill } from "@oca/ui";

/** ສະຖານະສະຕ໋ອກຂອງ variant ທີ່ເລືອກ: ບອກຈຳນວນສະເພາະເມື່ອໃກ້ໝົດ */
export function StockBadge({ stock }: { stock: StoreStock }) {
  if (stock.status === "OUT") return <StatusPill tone="danger">ສິນຄ້າໝົດ</StatusPill>;
  if (stock.status === "LOW") {
    return <StatusPill tone="warning">{stock.remaining === null ? "ໃກ້ໝົດ" : `ເຫຼືອ ${stock.remaining} ອັນ`}</StatusPill>;
  }
  return <StatusPill tone="success">ມີສິນຄ້າ</StatusPill>;
}
