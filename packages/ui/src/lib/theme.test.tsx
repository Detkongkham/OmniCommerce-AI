import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme-script";
import { ThemeProvider, useTheme } from "./theme";

type Listener = (event: { matches: boolean }) => void;

function mockMatchMedia(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<Listener>();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    matches = next;
    for (const l of listeners) l({ matches: next });
  };
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("light")}>light</button>
      <button onClick={() => setTheme("system")}>system</button>
    </div>
  );
}

const root = document.documentElement;

beforeEach(() => {
  window.localStorage.clear();
  root.classList.remove("dark");
  root.style.colorScheme = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error restore jsdom default (no matchMedia)
  delete window.matchMedia;
});

describe("ThemeProvider", () => {
  it("defaults to system and resolves to light without matchMedia", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("follows the OS preference in system mode, including live changes", () => {
    const setOsDark = mockMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
    act(() => setOsDark(false));
    expect(root.classList.contains("dark")).toBe(false);
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });

  it("applies and persists an explicit choice", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(root.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    await user.click(screen.getByRole("button", { name: "light" }));
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("restores the stored choice on mount", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("ignores an invalid stored value and survives unavailable storage", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "purple");
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("restores a stored system choice and follows the OS", () => {
    mockMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("stops listening to the OS after switching to an explicit theme", async () => {
    const setOsDark = mockMatchMedia(false);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "dark" }));
    act(() => setOsDark(false));
    expect(root.classList.contains("dark")).toBe(true);
    act(() => setOsDark(true));
    await user.click(screen.getByRole("button", { name: "light" }));
    act(() => setOsDark(true));
    expect(root.classList.contains("dark")).toBe(false);
  });

  it.each([
    { stored: "dark", osDark: false },
    { stored: "light", osDark: true },
  ])("never flips the html class while restoring stored $stored (OS dark=$osDark)", ({ stored, osDark }) => {
    mockMatchMedia(osDark);
    window.localStorage.setItem(THEME_STORAGE_KEY, stored);
    // ຈຳລອງ script ທີ່ຮັນກ່ອນ paint
    if (stored === "dark") root.classList.add("dark");
    const seen: boolean[] = [];
    const observer = new MutationObserver(() => {});
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const mo = vi.spyOn(root.classList, "toggle");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    seen.push(...observer.takeRecords().map(() => root.classList.contains("dark")));
    observer.disconnect();
    // ຕ້ອງບໍ່ມີການ toggle ໄປຜິດທິດໃນລະຫວ່າງ mount
    for (const call of mo.mock.calls) expect(call[1]).toBe(stored === "dark");
    expect(root.classList.contains("dark")).toBe(stored === "dark");
    expect(seen.every((d) => d === (stored === "dark"))).toBe(true);
  });

  it("useTheme throws outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow("useTheme must be used within ThemeProvider");
    spy.mockRestore();
  });
});

describe("THEME_INIT_SCRIPT", () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it("adds the dark class for a stored dark theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    run();
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
  });

  it("uses the OS preference when nothing is stored", () => {
    mockMatchMedia(true);
    run();
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("stays light for a stored light theme even if the OS is dark", () => {
    mockMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    run();
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("treats a stored system theme like no choice", () => {
    mockMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    run();
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("never throws when storage and matchMedia are unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
  });
});
