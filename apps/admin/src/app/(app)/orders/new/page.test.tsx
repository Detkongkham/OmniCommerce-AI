import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import NewOrderPage from "./page";

describe("/orders/new page", () => {
  it("ຕ້ອງມີທັງ orders:write ແລະ inventory:read (ຟອມຍິງ /variants, /warehouses, /settings/store ທີ່ຕ້ອງ inventory:read)", () => {
    const element = NewOrderPage();
    expect(isValidElement(element)).toBe(true);
    const gate = element as { props: { permission: string[] } };
    expect([...gate.props.permission].sort()).toEqual(["inventory:read", "orders:write"]);
  });
});
