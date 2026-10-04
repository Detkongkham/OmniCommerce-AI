import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { dictionaries, translate } from "./dictionary";
import { LanguageProvider, useT } from "./language-provider";

const placeholders = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort().join(",");

describe("translate", () => {
  it("ແທນ {param} ດ້ວຍຄ່າ", () => {
    expect(translate("en", "page.showing", { from: 1, to: 10, total: 142 })).toBe("Showing 1-10 of 142 items");
    expect(translate("lo", "staff.count", { count: 3 })).toBe("3 ຄົນ");
  });

  it("param ທີ່ຂາດ ປະ placeholder ໄວ້ຕາມເດີມ", () => {
    expect(translate("en", "staff.count")).toBe("{count} people");
    expect(translate("en", "staff.count", {})).toBe("{count} people");
  });
});

describe("dictionaries", () => {
  it("lo ແລະ en ມີ key ຄືກັນ, ບໍ່ມີຄ່າຫວ່າງ ແລະ ມີ placeholder ຊຸດດຽວກັນ", () => {
    const loKeys = Object.keys(dictionaries.lo).sort();
    expect(Object.keys(dictionaries.en).sort()).toEqual(loKeys);
    for (const key of loKeys) {
      const lo = dictionaries.lo[key as keyof typeof dictionaries.lo];
      const en = dictionaries.en[key as keyof typeof dictionaries.en];
      expect(lo.trim(), key).not.toBe("");
      expect(en.trim(), key).not.toBe("");
      expect(placeholders(lo), key).toBe(placeholders(en));
    }
  });
});

function Probe() {
  const { t, language, setLanguage } = useT();
  return (
    <div>
      <p data-testid="label">{t("common.cancel")}</p>
      <p data-testid="lang">{language}</p>
      <button type="button" onClick={() => setLanguage("en")}>
        switch
      </button>
    </div>
  );
}

describe("LanguageProvider", () => {
  it("ເລີ່ມເປັນລາວ, ປ່ຽນເປັນ en ແລ້ວຈື່ໃນ localStorage ແລະ ຕັ້ງ <html lang>", async () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("label")).toHaveTextContent("ຍົກເລີກ");
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("label")).toHaveTextContent("Cancel");
    expect(window.localStorage.getItem("oca_lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("ອ່ານພາສາທີ່ບັນທຶກໄວ້ເມື່ອບໍ່ມີ initialLanguage", async () => {
    window.localStorage.setItem("oca_lang", "en");
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("lang")).toHaveTextContent("en"));
  });
});
