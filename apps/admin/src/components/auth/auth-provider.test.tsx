import type { Permission } from "@oca/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loginRequest, logoutRequest, refreshSession } from "@/lib/api";
import { AuthProvider, useAuth } from "./auth-provider";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  refreshSession: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
}));

function makeSession(accessToken: string, email: string, roleName: string, permissions: Permission[]) {
  return { accessToken, user: { id: email, email, name: roleName, roleId: roleName, roleName, permissions } };
}
const owner = makeSession("t1", "owner@example.com", "OWNER", ["staff:read", "staff:write"]);
const viewer = makeSession("t2", "viewer@example.com", "VIEWER", ["staff:read"]);

function Probe() {
  const { status, user, can, login, logout } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.email ?? "-"}</p>
      <p data-testid="can-write">{String(can("staff:write"))}</p>
      <button type="button" onClick={() => void login({ email: "viewer@example.com", password: "password123" })}>
        login
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

function renderProbe() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const status = () => screen.getByTestId("status");

beforeEach(() => {
  vi.mocked(refreshSession).mockReset();
  vi.mocked(loginRequest).mockReset();
  vi.mocked(logoutRequest).mockReset();
});

describe("AuthProvider", () => {
  it("ເລີ່ມ loading ແລ້ວເປັນ authenticated ເມື່ອ refresh ສຳເລັດ ແລະ can() ຕາມ permission", async () => {
    vi.mocked(refreshSession).mockResolvedValue(owner);
    renderProbe();
    expect(status()).toHaveTextContent("loading");
    await waitFor(() => expect(status()).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("owner@example.com");
    expect(screen.getByTestId("can-write")).toHaveTextContent("true");
  });

  it("can() ເປັນ false ເມື່ອບໍ່ມີ permission", async () => {
    vi.mocked(refreshSession).mockResolvedValue(viewer);
    renderProbe();
    await waitFor(() => expect(status()).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("can-write")).toHaveTextContent("false");
  });

  it("ເປັນ unauthenticated ເມື່ອ refresh ໄດ້ null", async () => {
    vi.mocked(refreshSession).mockResolvedValue(null);
    renderProbe();
    await waitFor(() => expect(status()).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("-");
  });

  it("login ປ່ຽນເປັນ authenticated", async () => {
    vi.mocked(refreshSession).mockResolvedValue(null);
    vi.mocked(loginRequest).mockResolvedValue(viewer);
    renderProbe();
    await waitFor(() => expect(status()).toHaveTextContent("unauthenticated"));
    await userEvent.click(screen.getByRole("button", { name: "login" }));
    await waitFor(() => expect(status()).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("viewer@example.com");
  });

  it("logout ເອີ້ນ API ແລ້ວກັບເປັນ unauthenticated (ເຖິງ API ຈະລົ້ມ)", async () => {
    vi.mocked(refreshSession).mockResolvedValue(owner);
    vi.mocked(logoutRequest).mockRejectedValue(new Error("network"));
    renderProbe();
    await waitFor(() => expect(status()).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(status()).toHaveTextContent("unauthenticated"));
    expect(logoutRequest).toHaveBeenCalledTimes(1);
  });
});
