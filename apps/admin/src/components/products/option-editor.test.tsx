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
    await user.type(screen.getByLabelText("Option name 1"), "Color");
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
    await user.click(screen.getByRole("button", { name: "Add value Color" }));
    expect(state()[0]?.values).toEqual(["Green"]);
    expect(screen.getByPlaceholderText("Type a value and press Enter")).toHaveValue("");
  });

  it("removes a value and an option", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: ["Red", "Blue"] }]} />);
    await user.click(screen.getByRole("button", { name: "Remove value Red" }));
    expect(state()[0]?.values).toEqual(["Blue"]);
    await user.click(screen.getByRole("button", { name: "Remove option Color" }));
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

  it("gives each row unique accessible names", () => {
    renderWithProviders(
      <Harness
        initial={[
          { name: "Color", values: ["Red"] },
          { name: "", values: ["S"] },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Remove option Color" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove option 2" })).toBeInTheDocument();
    expect(screen.getByLabelText("Option name 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Option name 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Option values Color")).toBeInTheDocument();
    expect(screen.getByLabelText("Option values 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add value Color" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add value 2" })).toBeInTheDocument();
  });

  it("exposes the warning through role=status and links it to the name input", () => {
    renderWithProviders(<Harness initial={[{ name: "Color", values: [] }]} />);
    const status = within(screen.getByTestId("option-0")).getByRole("status");
    expect(status).toHaveTextContent("This option has no values yet, so it will be ignored");
    expect(screen.getByLabelText("Option name 1")).toHaveAccessibleDescription(/no values yet/);
  });

  it("keeps an empty live region when there is no warning", () => {
    renderWithProviders(<Harness initial={[{ name: "Color", values: ["Red"] }]} />);
    expect(within(screen.getByTestId("option-0")).getByRole("status")).toBeEmptyDOMElement();
  });

  it("focuses the new row's name input after Add option", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: ["Red"] }]} />);
    await user.click(screen.getByRole("button", { name: "Add option" }));
    expect(screen.getByLabelText("Option name 2")).toHaveFocus();
  });

  it("moves focus to Add option after removing an option", async () => {
    const { user } = renderWithProviders(
      <Harness
        initial={[
          { name: "A", values: ["1"] },
          { name: "B", values: ["1"] },
          { name: "C", values: ["1"] },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove option B" }));
    expect(screen.getByRole("button", { name: "Add option" })).toHaveFocus();
  });

  it("moves focus to the value input after removing a chip or using the add button", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: ["Red", "Blue"] }]} />);
    await user.click(screen.getByRole("button", { name: "Remove value Red" }));
    expect(screen.getByLabelText("Option values Color")).toHaveFocus();
    await user.type(screen.getByLabelText("Option values Color"), "Green");
    await user.click(screen.getByRole("button", { name: "Add value Color" }));
    expect(screen.getByLabelText("Option values Color")).toHaveFocus();
    expect(state()[0]?.values).toEqual(["Blue", "Green"]);
  });

  it("trims whitespace from a committed value", async () => {
    const { user } = renderWithProviders(<Harness initial={[{ name: "Color", values: [] }]} />);
    await user.type(screen.getByLabelText("Option values Color"), "  Red  {Enter}");
    expect(state()[0]?.values).toEqual(["Red"]);
  });

  it("does not add a 4th option when clicking the disabled button", async () => {
    const { user } = renderWithProviders(
      <Harness
        initial={[
          { name: "A", values: ["1"] },
          { name: "B", values: ["1"] },
          { name: "C", values: ["1"] },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add option" }));
    expect(state()).toHaveLength(3);
  });
});
