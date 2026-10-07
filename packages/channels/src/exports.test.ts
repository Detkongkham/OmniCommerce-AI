import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as root from "./index";

describe("package exports", () => {
  it("does not expose the simulator from the root index", () => {
    expect("simulator" in root).toBe(false);
  });

  it("resolves @oca/channels/simulator to the built simulator", () => {
    const resolved = createRequire(import.meta.url).resolve("@oca/channels/simulator");
    expect(resolved).toMatch(/dist[\\/]simulator[\\/]index\.js$/);
  });
});
