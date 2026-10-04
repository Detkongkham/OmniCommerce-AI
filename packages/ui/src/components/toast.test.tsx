import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_DURATION_MS, clearToasts, dismissToast, getToasts, toast } from "./toast-store";
import { Toaster } from "./toaster";

beforeEach(() => {
  clearToasts();
});

describe("toast store", () => {
  it("ເກັບສູງສຸດ 5 ອັນ ແລະ ອັນໃໝ່ຢູ່ກ່ອນ", () => {
    for (let i = 1; i <= 6; i++) toast.info(`t${i}`);
    expect(getToasts().map((item) => item.title)).toEqual(["t6", "t5", "t4", "t3", "t2"]);
  });

  it("ຕັ້ງ variant ແລະ duration ເລີ່ມຕົ້ນ 8 ວິນາທີ", () => {
    toast.success("ok", "detail");
    toast.error("bad");
    const [error, success] = getToasts();
    expect(error).toMatchObject({ variant: "error", title: "bad", duration: TOAST_DURATION_MS });
    expect(success).toMatchObject({ variant: "success", title: "ok", description: "detail" });
    expect(TOAST_DURATION_MS).toBe(8000);
  });

  it("dismissToast ເອົາອອກສະເພາະ id ນັ້ນ", () => {
    const first = toast.info("a");
    toast.info("b");
    dismissToast(first);
    expect(getToasts().map((item) => item.title)).toEqual(["b"]);
  });
});

describe("Toaster", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ສະແດງ toast ແລ້ວປິດເອງຫຼັງ 8 ວິນາທີ", () => {
    render(<Toaster />);
    act(() => {
      toast.success("Saved");
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("ປຸ່ມປິດເອົາ toast ອອກທັນທີ", () => {
    render(<Toaster dismissLabel="Dismiss" />);
    act(() => {
      toast.error("Oops");
    });
    act(() => {
      screen.getByRole("button", { name: "Dismiss" }).click();
    });
    expect(screen.queryByText("Oops")).not.toBeInTheDocument();
  });
});
