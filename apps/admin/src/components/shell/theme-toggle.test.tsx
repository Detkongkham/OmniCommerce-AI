import { ThemeProvider } from "@oca/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import { ThemeToggle } from "./theme-toggle";

function setup() {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  const user = userEvent.setup();
  render(
    <LanguageProvider initialLanguage="en">
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    </LanguageProvider>,
  );
  return user;
}

describe("ThemeToggle", () => {
  beforeEach(() => window.localStorage.clear());

  it("cycles system → light → dark → system and labels the current mode", async () => {
    const user = setup();
    const button = () => screen.getByRole("button", { name: /Change theme/ });
    expect(button()).toHaveAccessibleName("Change theme: System");

    await user.click(button());
    expect(button()).toHaveAccessibleName("Change theme: Light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(button());
    expect(button()).toHaveAccessibleName("Change theme: Dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(button());
    expect(button()).toHaveAccessibleName("Change theme: System");
  });
});
