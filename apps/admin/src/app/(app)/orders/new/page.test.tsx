import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import NewOrderPage from "./page";

type GateElement = { props: { permission: string[]; children: { type: { name: string }; props: Record<string, unknown> } } };

async function render(searchParams: { conversationId?: string | string[] }) {
  const element = await NewOrderPage({ searchParams: Promise.resolve(searchParams) });
  expect(isValidElement(element)).toBe(true);
  return element as unknown as GateElement;
}

describe("/orders/new page", () => {
  it("ຕ້ອງມີທັງ orders:write ແລະ inventory:read (ຟອມຍິງ /variants, /warehouses, /settings/store ທີ່ຕ້ອງ inventory:read)", async () => {
    const gate = await render({});
    expect([...gate.props.permission].sort()).toEqual(["inventory:read", "orders:write"]);
    expect(gate.props.children.type.name).toBe("OrderForm");
  });

  it("ມີ conversationId: ເພີ່ມ inbox:write ແລະ ສະແດງ ChatOrderPage ດ້ວຍ id ທີ່ຕັດຊ່ອງວ່າງ", async () => {
    const gate = await render({ conversationId: " conv1 " });
    expect([...gate.props.permission].sort()).toEqual(["inbox:write", "inventory:read", "orders:write"]);
    expect(gate.props.children.type.name).toBe("ChatOrderPage");
    expect(gate.props.children.props.conversationId).toBe("conv1");
  });

  it("conversationId ເປັນ array ຫຼື ມີແຕ່ວ່າງ: notFound() (ບໍ່ຫຼຸດໄປຟອມປົກກະຕິແບບງຽບໆ)", async () => {
    for (const value of ["", "  ", ["a", "b"]]) {
      await expect(render({ conversationId: value })).rejects.toThrow();
    }
  });
});
