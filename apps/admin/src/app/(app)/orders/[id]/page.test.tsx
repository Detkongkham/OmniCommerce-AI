import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import OrderPage from "./page";

const render = (id: string) => OrderPage({ params: Promise.resolve({ id }) });

describe("/orders/[id] page", () => {
  it("id ທີ່ຖືກຮູບ (cuid): ສົ່ງ id ໄປ OrderDetail ພາຍໃຕ້ PermissionGate orders:read", async () => {
    const element = await render("cmabc123XYZ");
    expect(isValidElement(element)).toBe(true);
    const gate = element as { props: { permission: string; children: { key: string | null; props: { id: string } } } };
    expect(gate.props.permission).toBe("orders:read");
    expect(gate.props.children.props.id).toBe("cmabc123XYZ");
    // key = id: ໄປບິນອື່ນແລ້ວ state ຂອງບິນເກົ່າ (ເຊັ່ນ latch ນັບຖອຍ) ບໍ່ຕິດໄປ
    expect(gate.props.children.key).toBe("cmabc123XYZ");
  });

  it.each(["", " ", "a/b", "../x", "a b", "x".repeat(65), "ໄທ"])("id ບໍ່ຖືກຮູບ %j: notFound()", async (id) => {
    await expect(render(id)).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") });
  });
});
