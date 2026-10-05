import { screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { OptionDraft } from "@/lib/variant-matrix";
import { renderWithProviders } from "@/test/render";
import { OptionEditor } from "./option-editor";

function Harness({ initial = [] as OptionDraft[] }) {
  const [options, setOptions] = useState<OptionDraft[]>(initial);
  return (
    <>
      <OptionEditor options={options} onChange={setOptions} />
      <pre data-testid="state">{JSON.stringify(options)}</pre>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "[]") as OptionDraft[];

describe("OptionEditor", () => {
  it("adds an option, names it and adds values with Enter (no empty/duplicate values)", async () => {
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option name"), "Color");
    const input = screen.getByPlaceholderText("Type a value and press Enter");
    await user.type(input, "Red{Enter}");
    await user.type(input, "Blue{Enter}");
    await user.type(input, "Red{Enter}");
    await user.type(input, "{Enter}");
    expect(state()).toEqual([{ name: "Color", values: ["Red", "Blue"] }]);
  });

  it("does not commit values per keystroke", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: [] }]} />);
    await user.type(screen.getByPlaceholderText("Type a value and press Enter"), "Re");
    expect(state()[0]?.values).toEqual([]);
  });

  it("commits a pending value on blur", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: [] }]} />);
    await user.type(screen.getByPlaceholderText("Type a value and press Enter"), "Red");
    await user.tab();
    expect(state()[0]?.values).toEqual(["Red"]);
  });

  it("commits a value with the add button", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: [] }]} />);
    await user.type(screen.getByPlaceholderText("Type a value and press Enter"), "Green");
    await user.click(screen.getByRole("button", { name: "Add value" }));
    expect(state()[0]?.values).toEqual(["Green"]);
    expect(screen.getByPlaceholderText("Type a value and press Enter")).toHaveValue("");
  });

  it("removes a value and an option", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: ["Red", "Blue"] }]} />);
    await user.click(screen.getByRole("button", { name: "Remove value Red" }));
    expect(state()[0]?.values).toEqual(["Blue"]);
    await user.click(screen.getByRole("button", { name: "Remove option" }));
    expect(state()).toEqual([]);
  });

  it("at most 3 options: add button disabled with an explanation", () => {
    renderWithProviders(
      <Harness
        initial={[
          { name: "A", values: ["1"] },
          { name: "B", values: ["1"] },
          { name: "C", values: ["1"] },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Add option" })).toBeDisabled();
    expect(screen.getByText("At most 3 options")).toBeInTheDocument();
  });

  it("shows values as chips per option", () => {
    renderWithProviders(<Harness initial={[{ name: "Size", values: ["S", "M"] }]} />);
    const group = screen.getByTestId("option-0");
    expect(within(group).getByText("S")).toBeInTheDocument();
    expect(within(group).getByText("M")).toBeInTheDocument();
  });

  it("warns when a later option repeats a name (after trim)", () => {
    renderWithProviders(
      <Harness
        initial={[
          { name: "Color", values: ["Red"] },
          { name: " Color ", values: ["Blue"] },
        ]}
      />,
    );
    expect(within(screen.getByTestId("option-0")).queryByText(/name is already used/)).toBeNull();
    expect(within(screen.getByTestId("option-1")).getByText(/name is already used/)).toBeInTheDocument();
  });

  it("warns about an option with a name but no values, or values but no name", () => {
    renderWithProviders(
      <Harness
        initial={[
          { name: "Color", values: [] },
          { name: "  ", values: ["S"] },
          { name: "", values: [] },
        ]}
      />,
    );
    expect(within(screen.getByTestId("option-0")).getByText(/no values yet/)).toBeInTheDocument();
    expect(within(screen.getByTestId("option-1")).getByText(/no name yet/)).toBeInTheDocument();
    expect(within(screen.getByTestId("option-2")).queryByText(/will be ignored/)).toBeNull();
  });
});
