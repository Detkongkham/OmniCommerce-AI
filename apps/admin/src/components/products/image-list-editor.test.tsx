import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { ImageDraft } from "@/lib/product-form";
import { renderWithProviders } from "@/test/render";
import { ImageListEditor } from "./image-list-editor";

function Harness({ initial = [] as ImageDraft[] }) {
  const [images, setImages] = useState(initial);
  return (
    <>
      <ImageListEditor images={images} onChange={setImages} variants={[{ key: "v1", label: "Red" }]} />
      <pre data-testid="state">{JSON.stringify(images)}</pre>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "[]") as ImageDraft[];

const two: ImageDraft[] = [
  { url: "https://x/1.png", alt: "", variantKey: "" },
  { url: "https://x/2.png", alt: "", variantKey: "" },
];

describe("ImageListEditor", () => {
  it("adds an image, sets URL/description and links it to a variant", async () => {
    const { user } = renderWithProviders(<Harness />);
    expect(screen.getByText("No images yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add image" }));
    expect(screen.queryByText("No images yet")).toBeNull();
    await user.type(screen.getByLabelText("Image URL (http/https) 1"), "https://x/a.png");
    await user.type(screen.getByLabelText("Image description 1"), "front");
    await user.selectOptions(screen.getByLabelText("Linked variant 1"), "v1");
    expect(state()).toEqual([{ url: "https://x/a.png", alt: "front", variantKey: "v1" }]);
  });

  it("moves up/down with disabled edges, and removes", async () => {
    const { user } = renderWithProviders(<Harness initial={two} />);
    expect(screen.getByRole("button", { name: "Move up 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move down 2" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move down 1" }));
    expect(state().map((image) => image.url)).toEqual(["https://x/2.png", "https://x/1.png"]);
    await user.click(screen.getByRole("button", { name: "Move up 2" }));
    expect(state().map((image) => image.url)).toEqual(["https://x/1.png", "https://x/2.png"]);
    await user.click(screen.getByRole("button", { name: "Remove image 1" }));
    expect(state().map((image) => image.url)).toEqual(["https://x/2.png"]);
  });

  it("previews only http(s) URLs, using the alt text", () => {
    renderWithProviders(
      <Harness
        initial={[
          { url: "https://x/ok.png", alt: "ok", variantKey: "" },
          { url: "javascript:alert(1)", alt: "bad", variantKey: "" },
          { url: "https://x/decor.png", alt: "", variantKey: "" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "ok" })).toHaveAttribute("src", "https://x/ok.png");
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(document.querySelectorAll("img")).toHaveLength(2);
    expect(document.querySelector('img[src^="javascript"]')).toBeNull();
  });

  it("focuses the new row's URL input after Add image", async () => {
    const { user } = renderWithProviders(<Harness initial={two} />);
    await user.click(screen.getByRole("button", { name: "Add image" }));
    expect(screen.getByLabelText("Image URL (http/https) 3")).toHaveFocus();
  });

  it("moves focus to Add image after removing an image", async () => {
    const { user } = renderWithProviders(<Harness initial={two} />);
    await user.click(screen.getByRole("button", { name: "Remove image 1" }));
    expect(screen.getByRole("button", { name: "Add image" })).toHaveFocus();
  });

  it("hides Add image at 20 images", () => {
    renderWithProviders(
      <Harness initial={Array.from({ length: 20 }, (_, i) => ({ url: `https://x/${i}.png`, alt: "", variantKey: "" }))} />,
    );
    expect(screen.queryByRole("button", { name: "Add image" })).toBeNull();
  });
});
