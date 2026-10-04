import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("email/ລະຫັດຜິດຮູບແບບ: ສະແດງ error ແລະ ບໍ່ເອີ້ນ onSubmit", async () => {
    const onSubmit = vi.fn();
    const { user } = renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ສົ່ງຄ່າທີ່ຜ່ານ schema ແລ້ວ (email ເປັນຕົວນ້ອຍ, ຕັດຊ່ອງວ່າງ)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Email"), " Owner@Example.COM ");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ email: "owner@example.com", password: "password123" });
  });

  it("401 ຈາກ API: ສະແດງຂໍ້ຄວາມ credentials ຜິດ", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(401, "Invalid credentials"));
    const { user } = renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password");
  });

  it("429: ສະແດງຂໍ້ຄວາມລອງຫຼາຍເກີນໄປ; ປຸ່ມເບິ່ງລະຫັດຜ່ານສະຫຼັບ type", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(429, "Too Many Requests"));
    const { user } = renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(password, "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });
});
