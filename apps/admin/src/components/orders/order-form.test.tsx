import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import type { CustomerDto, VariantSearchItemDto } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { OrderForm } from "./order-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const tee: VariantSearchItemDto = {
  id: "v1", sku: "TEE-R", barcode: null, name: "Red", productId: "p1", productName: "Tee", productStatus: "ACTIVE",
  imageUrl: null, price: "100.00", isActive: true, availableTotal: 8,
  stock: [{ warehouseId: "w1", onHand: 10, reserved: 2, available: 8 }, { warehouseId: "w2", onHand: 1, reserved: 0, available: 1 }],
};
const mug: VariantSearchItemDto = {
  ...tee, id: "v2", sku: "MUG-1", name: "Blue", productName: "Mug", price: "50.00", availableTotal: 3,
  stock: [{ warehouseId: "w1", onHand: 3, reserved: 0, available: 3 }],
};
const mali: CustomerDto = { id: "c1", name: "Mali", phone: "02055550001", email: null };
const warehouses = [
  { id: "w1", code: "MAIN", name: "Main", address: null, isDefault: true, isActive: true },
  { id: "w2", code: "B2", name: "Branch 2", address: null, isDefault: false, isActive: true },
];
const settings = { name: "OCA", baseCurrency: "LAK", vatRate: "10.00", pricesIncludeVat: true, reservationMinutes: 30 };

function mockApi(overrides: Record<string, unknown> = {}) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string }) => {
    if (path in overrides) {
      const value = overrides[path];
      if (value instanceof Error) throw value;
      return value;
    }
    if (path === "/warehouses") return warehouses;
    if (path === "/settings/store") return settings;
    if (path.startsWith("/variants")) return { items: [tee, mug], total: 2, page: 1, pageSize: 8 };
    if (path.startsWith("/customers")) return { items: [mali], total: 1, page: 1, pageSize: 8 };
    if (path === "/orders" && options?.method === "POST") return { id: "new-order", orderNumber: "SO-000001" };
    return { items: [], total: 0, page: 1, pageSize: 8 };
  }) as typeof apiFetch);
}

type User = ReturnType<typeof renderWithProviders>["user"];

async function addVariant(user: User, text: string, sku: string) {
  await user.type(screen.getByLabelText("Add item (search SKU/name)"), text);
  await user.click(await screen.findByRole("option", { name: new RegExp(sku) }));
}
const addTee = (user: User) => addVariant(user, "tee", "TEE-R");

const submitButton = () => screen.getByRole("button", { name: "Create order and reserve stock" });
const orderCalls = () => vi.mocked(apiFetch).mock.calls.filter((call) => call[0] === "/orders");
const keyOf = (call: unknown[] | undefined) => (call?.[1] as { headers?: Record<string, string> } | undefined)?.headers?.["Idempotency-Key"];

async function setQty(user: User, sku: string, value: string) {
  const input = screen.getByLabelText(`Qty ${sku}`);
  await user.clear(input);
  if (value) await user.type(input, value);
}

beforeEach(() => {
  router.push.mockReset();
  vi.mocked(apiFetch).mockReset();
  mockApi();
});

describe("OrderForm", () => {
  it("ເພີ່ມສິນຄ້າ: ສະແດງແຖວໃນຕາຕະລາງ (ລາຄາ, ສາງຫຼັກ, ຂາຍໄດ້) ແລະ ສະຫຼຸບເງິນຄາດຄະເນຈາກ VAT ໃນຕັ້ງຄ່າຮ້ານ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    const table = screen.getByRole("table", { name: "Order items" });
    expect(within(table).getAllByRole("columnheader").length).toBeGreaterThanOrEqual(5);
    const row = screen.getByTestId("order-line-0");
    expect(within(row).getByText("Tee — Red")).toBeInTheDocument();
    expect(within(row).getByText("TEE-R")).toBeInTheDocument();
    expect(within(row).getByText("Available 8")).toBeInTheDocument();
    expect(within(row).getByLabelText("Warehouse TEE-R")).toHaveValue("");
    expect(within(row).getByRole("option", { name: "Default (MAIN)" })).toBeInTheDocument();
    await setQty(user, "TEE-R", "2");
    await user.type(within(row).getByLabelText("Discount TEE-R"), "10");
    // 2×100 − 10 = 190 ; VAT 10% ລວມໃນລາຄາ = 17.27
    expect(await screen.findByTestId("summary-total")).toHaveTextContent("190.00");
    expect(screen.getByTestId("summary-vat")).toHaveTextContent("17.27");
    expect(screen.getByText("This is an estimate. The system calculates the real amount when saving")).toBeInTheDocument();
  });

  it("ຊ່ອງຈຳນວນ/ສ່ວນຫຼຸດ/ຄ່າສົ່ງ/ເວລາຈອງເປັນ text input (ບໍ່ແມ່ນ type=number) ເພື່ອແຍກ 'ເປົ່າ' ອອກຈາກ 'ຜິດ'", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    for (const label of ["Qty TEE-R", "Discount TEE-R", "Shipping fee", "Reservation time (minutes)"]) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute("type", "number");
    }
    expect(screen.getByLabelText("Qty TEE-R")).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText("Discount TEE-R")).toHaveAttribute("inputmode", "decimal");
  });

  it("ເພີ່ມສິນຄ້າແລ້ວ focus ໄປຊ່ອງຈຳນວນຂອງແຖວໃໝ່; ລຶບແຖວແລ້ວ focus ກັບຊ່ອງຄົ້ນຫາສິນຄ້າ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    expect(screen.getByLabelText("Qty TEE-R")).toHaveFocus();
    await addVariant(user, "mug", "MUG-1");
    expect(screen.getByLabelText("Qty MUG-1")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Remove row TEE-R" }));
    expect(screen.queryByLabelText("Qty TEE-R")).toBeNull();
    expect(screen.getByLabelText("Add item (search SKU/name)")).toHaveFocus();
  });

  it("variant ທີ່ເພີ່ມແລ້ວບໍ່ຂຶ້ນໃນຜົນຄົ້ນຫາອີກ (ບິນດຽວມີ variant ໜຶ່ງແຖວ ຈຶ່ງບໍ່ເກີດ (variant, ສາງ) ຊ້ຳ)", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.type(screen.getByLabelText("Add item (search SKU/name)"), "t");
    // mug ຍັງເລືອກໄດ້ ແຕ່ tee ຖືກຕັດອອກ
    expect(await screen.findByRole("option", { name: /MUG-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /TEE-R/ })).toBeNull();
    // ປ່ຽນສາງຂອງແຖວບໍ່ເຮັດໃຫ້ເກີດແຖວຊ້ຳ ແລະ ບໍ່ເຮັດໃຫ້ tee ກັບມາໃນຜົນ
    await user.selectOptions(screen.getByLabelText("Warehouse TEE-R"), "w2");
    await user.selectOptions(screen.getByLabelText("Warehouse TEE-R"), "");
    expect(screen.getAllByTestId(/order-line-/)).toHaveLength(1);
    expect(screen.queryByRole("option", { name: /TEE-R/ })).toBeNull();
  });

  it("ຈຳນວນເກີນສະຕ໋ອກທີ່ຂາຍໄດ້: ເຕືອນ (ແຕ່ຍັງສົ່ງໄດ້); ປ່ຽນສາງເປັນ B2 ປ່ຽນຕົວເລກຂາຍໄດ້", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    const row = screen.getByTestId("order-line-0");
    await setQty(user, "TEE-R", "9");
    expect(within(row).getByText("Exceeds available stock (8)")).toBeInTheDocument();
    expect(screen.getByLabelText("Qty TEE-R")).toHaveAccessibleDescription(/Exceeds available stock \(8\)/);
    await user.selectOptions(within(row).getByLabelText("Warehouse TEE-R"), "w2");
    expect(within(row).getByText("Available 1")).toBeInTheDocument();
    expect(within(row).getByText("Exceeds available stock (1)")).toBeInTheDocument();
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
  });

  it("ສ້າງບິນ (ລູກຄ້າໜ້າຮ້ານ): POST /orders ພ້ອມ Idempotency-Key ແລ້ວໄປໜ້າລາຍລະອຽດ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await setQty(user, "TEE-R", "2");
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
    const [, options] = orderCalls()[0] as [string, { method: string; body: unknown; headers: Record<string, string> }];
    expect(options.method).toBe("POST");
    expect(options.body).toEqual({ items: [{ variantId: "v1", quantity: 2, discount: "0" }], shippingFee: "0" });
    expect(options.headers["Idempotency-Key"]).toMatch(/^[\x21-\x7e]{1,128}$/);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/orders/new-order"));
  });

  it("ລູກຄ້າໃໝ່: ສົ່ງ customer { name, phone } ພ້ອມຄ່າສົ່ງ ແລະ ເວລາຈອງ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.click(screen.getByRole("radio", { name: "New customer" }));
    await user.type(screen.getByLabelText(/^Customer name/), "Mali");
    await user.type(screen.getByLabelText(/^Phone/), "02055550001");
    await user.type(screen.getByLabelText("Shipping fee"), "5");
    await user.type(screen.getByLabelText("Reservation time (minutes)"), "45");
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
    expect((orderCalls()[0]?.[1] as { body: unknown }).body).toEqual({
      customer: { name: "Mali", phone: "02055550001" },
      items: [{ variantId: "v1", quantity: 1, discount: "0" }],
      shippingFee: "5",
      reservationMinutes: 45,
    });
  });

  it("ລູກຄ້າທີ່ມີຢູ່: ສ່ວນລູກຄ້າເປັນ fieldset ທີ່ມີ legend (ບໍ່ອີງ label ຂອງ input ທີ່ຫາຍໄປຕອນເລືອກແລ້ວ) ແລະ ສົ່ງ customerId", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    const group = screen.getByRole("group", { name: "Customer" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    await user.click(within(group).getByRole("radio", { name: "Pick an existing customer" }));
    await user.type(screen.getByLabelText("Search name or phone"), "mal");
    await user.click(await screen.findByRole("option", { name: /Mali/ }));
    // ເລືອກແລ້ວ input ຫາຍ ແຕ່ group ຍັງມີຊື່
    expect(screen.queryByLabelText("Search name or phone")).toBeNull();
    expect(screen.getByRole("group", { name: "Customer" })).toBeInTheDocument();
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
    expect((orderCalls()[0]?.[1] as { body: { customerId: string } }).body.customerId).toBe("c1");
  });

  it("ກະຕ່າເປົ່າ: ປຸ່ມສ້າງບິນຖືກປິດ ແລະ ບອກເຫດຜົນຜ່ານ aria-describedby; ບໍ່ສົ່ງ API", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    const button = submitButton();
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("No items added yet");
    await user.click(button);
    expect(orderCalls()).toHaveLength(0);
    await addTee(user);
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).not.toHaveAttribute("aria-describedby");
  });

  it("ຂໍ້ມູນຜິດ: alert ແປແລ້ວ (ບໍ່ມີ path/ຂໍ້ຄວາມດິບ), ຊ່ອງທີ່ຜິດມີ aria-invalid + aria-describedby ຊີ້ alert, ບໍ່ສົ່ງ API, ແກ້ແລ້ວ alert ຫາຍ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await setQty(user, "TEE-R", "");
    await user.type(screen.getByLabelText("Discount TEE-R"), "abc");
    await user.type(screen.getByLabelText("Shipping fee"), "-1");
    await user.type(screen.getByLabelText("Reservation time (minutes)"), "1e3");
    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Please fix the following");
    expect(alert).toHaveTextContent("TEE-R: quantity must be a whole number of 1 or more");
    expect(alert).toHaveTextContent("TEE-R: discount is invalid or larger than the line amount");
    expect(alert).toHaveTextContent("Shipping fee is not valid");
    expect(alert).toHaveTextContent("Reservation time (minutes) is not valid");
    expect(alert.textContent).not.toMatch(/items\.|shippingFee|reservationMinutes|Invalid|Too small/);
    expect(orderCalls()).toHaveLength(0);

    for (const label of ["Qty TEE-R", "Discount TEE-R", "Shipping fee", "Reservation time (minutes)"]) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(/Please fix the following/);
      expect(document.getElementById(field.getAttribute("aria-describedby")?.split(" ").pop() ?? "")).toBe(alert);
    }
    // ຊ່ອງທີ່ບໍ່ຜິດບໍ່ຖືກໝາຍ
    expect(screen.getByLabelText("Note")).not.toHaveAttribute("aria-invalid");

    await user.type(screen.getByLabelText("Qty TEE-R"), "1");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Qty TEE-R")).not.toHaveAttribute("aria-invalid");
  });

  it("ເລືອກ 'ລູກຄ້າທີ່ມີ' ແຕ່ບໍ່ໄດ້ເລືອກ ແລະ 'ລູກຄ້າໃໝ່' ທີ່ເບີຜິດ: ແຈ້ງເຕືອນ ບໍ່ສົ່ງເປັນບິນໜ້າຮ້ານຢ່າງງຽບໆ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.click(screen.getByRole("radio", { name: "Pick an existing customer" }));
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a customer or switch to walk-in");
    expect(orderCalls()).toHaveLength(0);

    await user.click(screen.getByRole("radio", { name: "New customer" }));
    await user.type(screen.getByLabelText(/^Customer name/), "Mali");
    await user.type(screen.getByLabelText(/^Phone/), "abc");
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Phone is not valid");
    expect(screen.getByLabelText(/^Phone/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^Customer name/)).not.toHaveAttribute("aria-invalid");
    expect(orderCalls()).toHaveLength(0);
  });

  it("API ຕອບ INSUFFICIENT_STOCK: ໝາຍແຖວທີ່ບໍ່ພໍ + alert ທົ່ວໄປ ແລະ ບໍ່ໄປໜ້າອື່ນ", async () => {
    mockApi({
      "/orders": new ApiError(409, "x", [], "INSUFFICIENT_STOCK", {
        shortages: [{ variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 9, available: 8 }],
      }),
    });
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    const row = screen.getByTestId("order-line-0");
    await setQty(user, "TEE-R", "9");
    await user.click(submitButton());
    expect(await within(row).findByText("Not enough stock: needs 9 but only 8 available")).toBeInTheDocument();
    expect(screen.getByLabelText("Qty TEE-R")).toHaveAccessibleDescription(/Not enough stock: needs 9/);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Not enough stock");
    expect(alert).toHaveTextContent("TEE-R: needs 9 but only 8 available");
    expect(router.push).not.toHaveBeenCalled();
    // ຍັງສົ່ງໃໝ່ໄດ້ (ປຸ່ມບໍ່ຄ້າງ disabled)
    expect(submitButton()).toBeEnabled();
  });

  it("ບໍ່ມີສາງຫຼັກທີ່ເປີດ: ເຕືອນ ແລະ ຖ້າແຖວຍັງເປັນ 'ສາງຫຼັກ' ບໍ່ສົ່ງ API ແຕ່ບອກໃຫ້ເລືອກສາງ", async () => {
    mockApi({ "/warehouses": [{ ...warehouses[0], isDefault: false }] });
    const { user } = renderWithProviders(<OrderForm />);
    expect(await screen.findByText("There is no active default warehouse. Please pick a warehouse on each row")).toBeInTheDocument();
    await addTee(user);
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("TEE-R: pick a warehouse (there is no default warehouse)");
    expect(screen.getByLabelText("Warehouse TEE-R")).toHaveAttribute("aria-invalid", "true");
    expect(orderCalls()).toHaveLength(0);
    await user.selectOptions(screen.getByLabelText("Warehouse TEE-R"), "w1");
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
  });

  it("ກົດສົ່ງຊ້ຳຂະນະກຳລັງບັນທຶກ: POST ເທື່ອດຽວ ແລະ ປຸ່ມຖືກລັອກ", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockApi({ "/orders": new Promise((r) => { resolve = r; }) });
    const { user, container } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
    expect(submitButton()).toBeDisabled();
    // ສົ່ງ submit ຕົງໆ (ຂ້າມປຸ່ມທີ່ disabled) ເຊັ່ນ ກົດ Enter ໃນຊ່ອງ
    const form = container.querySelector("form");
    if (!form) throw new Error("no form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(orderCalls()).toHaveLength(1);
    resolve({ id: "new-order", orderNumber: "SO-000001" });
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
  });

  it("Idempotency: network ລົ້ມແລ້ວກົດສົ່ງ payload ເດີມ → ໃຊ້ key ເດີມ; ແກ້ payload → key ໃໝ່; ກົດຊ້ຳ payload ທີ່ແກ້ແລ້ວ → key ນັ້ນ", async () => {
    mockApi({ "/orders": new TypeError("Failed to fetch") });
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.click(submitButton());
    await screen.findByRole("alert");
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(2));
    const [first, second] = orderCalls();
    expect(keyOf(first)).toBeTruthy();
    expect(keyOf(second)).toBe(keyOf(first));

    await setQty(user, "TEE-R", "2");
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(3));
    const third = orderCalls()[2];
    expect(keyOf(third)).toBeTruthy();
    expect(keyOf(third)).not.toBe(keyOf(first));
    expect((third?.[1] as { body: { items: { quantity: number }[] } }).body.items[0]?.quantity).toBe(2);

    // ຖ້າສຳເລັດ ແຕ່ response ຫາຍ ກົດຊ້ຳ (payload ເດີມ) ຕ້ອງໄດ້ key ເດີມ ເພື່ອໃຫ້ API ຄືນບິນເກົ່າ
    mockApi();
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(4));
    expect(keyOf(orderCalls()[3])).toBe(keyOf(third));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/orders/new-order"));
  });

  it("Enter ໃນຊ່ອງໃດໆ (ຊ່ອງຄົ້ນຫາສິນຄ້າ/ໝາຍເຫດ/ຊື່/ເບີ/ຄ່າສົ່ງ/ເວລາຈອງ/ທີ່ຢູ່) ຕອນກະຕ່າບໍ່ເປົ່າ ບໍ່ສ້າງບິນ; ກົດປຸ່ມຈຶ່ງສ້າງເທື່ອດຽວ", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    // ເຄື່ອງສະແກນບາໂຄດ: ພິມລະຫັດ + Enter ໃນຊ່ອງຄົ້ນຫາ
    await user.type(screen.getByLabelText("Add item (search SKU/name)"), "mug{Enter}");
    await user.type(screen.getByLabelText("Note"), "x{Enter}");
    await user.type(screen.getByLabelText("Recipient name"), "x{Enter}");
    await user.type(screen.getByLabelText("Recipient phone"), "1{Enter}");
    await user.type(screen.getByLabelText("Shipping address"), "x{Enter}");
    await user.type(screen.getByLabelText("Shipping fee"), "5{Enter}");
    await user.type(screen.getByLabelText("Reservation time (minutes)"), "45{Enter}");
    await user.type(screen.getByLabelText("Discount TEE-R"), "1{Enter}");
    await user.type(screen.getByLabelText("Qty TEE-R"), "{Enter}");
    await user.click(screen.getByRole("radio", { name: "New customer" }));
    await user.type(screen.getByLabelText(/^Customer name/), "Mali{Enter}");
    await user.type(screen.getByLabelText(/^Phone/), "02055550001{Enter}");
    await user.type(screen.getByLabelText(/^Email/), "a@b.co{Enter}");
    // radio ຕ້ອງບໍ່ submit ດ້ວຍ Enter ເຊັ່ນກັນ
    screen.getByRole("radio", { name: "New customer" }).focus();
    await user.keyboard("{Enter}");
    expect(orderCalls()).toHaveLength(0);

    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
  });

  it("ຂະນະບັນທຶກ: ປຸ່ມຍົກເລີກ ແລະ ທຸກຊ່ອງຖືກລັອກ; ສຳເລັດແລ້ວປົດລັອກ", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockApi({ "/orders": new Promise((r) => { resolve = r; }) });
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByLabelText("Qty TEE-R")).toBeDisabled();
    expect(screen.getByLabelText("Note")).toBeDisabled();
    resolve({ id: "new-order", orderNumber: "SO-000001" });
    await waitFor(() => expect(screen.getByLabelText("Note")).toBeEnabled());
  });

  it("ອອກຈາກໜ້າ (unmount) ຂະນະກຳລັງບັນທຶກ: ບໍ່ພາໄປໜ້າບິນ ແລະ ບໍ່ເກີດ error ຂອງ React", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let resolve: (value: unknown) => void = () => {};
    mockApi({ "/orders": new Promise((r) => { resolve = r; }) });
    const { user, unmount } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
    unmount();
    resolve({ id: "new-order", orderNumber: "SO-000001" });
    await new Promise((r) => setTimeout(r, 20));
    expect(router.push).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("ສົ່ງບໍ່ຜ່ານ: focus ໄປທີ່ alert (ແມ່ນແຕ່ຂໍ້ຄວາມຄືເກົ່າຊ້ຳ), ຊ່ອງຍັງຊີ້ alert ດ້ວຍ aria-describedby", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await setQty(user, "TEE-R", "");
    await user.click(submitButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText("Qty TEE-R")).toHaveAccessibleDescription(/Please fix the following/);

    // ຍ້າຍ focus ໄປບ່ອນອື່ນ (ບໍ່ແກ້ຂໍ້ມູນ) ແລ້ວສົ່ງຊ້ຳ ໄດ້ຂໍ້ຄວາມເດີມ → ຕ້ອງ focus ກັບ alert ອີກ
    await user.click(screen.getByLabelText("Note"));
    expect(screen.getByLabelText("Note")).toHaveFocus();
    await user.click(submitButton());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });

  it("ເພີ່ມ/ລຶບແຖວ: ປະກາດຜ່ານ role=status ທີ່ເບິ່ງບໍ່ເຫັນ (SKU + ຈຳນວນແຖວ)", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    const region = screen.getByTestId("order-announce");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveClass("sr-only");
    await addTee(user);
    expect(region).toHaveTextContent("TEE-R added (1 items)");
    await addVariant(user, "mug", "MUG-1");
    expect(region).toHaveTextContent("MUG-1 added (2 items)");
    await user.click(screen.getByRole("button", { name: "Remove row TEE-R" }));
    expect(region).toHaveTextContent("TEE-R removed (1 items left)");
  });

  it("Idempotency: ຫຼັງ 409 INSUFFICIENT_STOCK ລອງ payload ເດີມ → ໃຊ້ key ເດີມ", async () => {
    mockApi({
      "/orders": new ApiError(409, "x", [], "INSUFFICIENT_STOCK", {
        shortages: [{ variantId: "v1", warehouseId: "w1", sku: "TEE-R", requested: 1, available: 0 }],
      }),
    });
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.click(submitButton());
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(2));
    expect(keyOf(orderCalls()[1])).toBe(keyOf(orderCalls()[0]));
  });

  it("Idempotency: ຫຼັງສຳເລັດ key ຖືກລ້າງ — ສົ່ງ payload ເດີມອີກ (ບິນໃໝ່) ໄດ້ key ໃໝ່", async () => {
    const { user } = renderWithProviders(<OrderForm />);
    await addTee(user);
    await user.click(submitButton());
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submitButton()).toBeEnabled());
    await user.click(submitButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(2));
    expect(keyOf(orderCalls()[1])).toBeTruthy();
    expect(keyOf(orderCalls()[1])).not.toBe(keyOf(orderCalls()[0]));
  });
});
