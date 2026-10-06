import { describe, expect, it } from "vitest";
import { classifyIngestError } from "./ingest-errors";

const prismaError = (code: string, meta?: unknown) =>
  Object.assign(new Error("x"), { name: "PrismaClientKnownRequestError", code, meta });

describe("classifyIngestError", () => {
  it("NUL byte (P2039 + SQLSTATE 22021) = permanent", () => {
    const error = prismaError("P2039", { driverAdapterError: { cause: { code: "22021" } } });
    expect(classifyIngestError(error)).toBe("permanent");
  });

  it("P2000/P2005/P2006/P2007/P2033 และ PrismaClientValidationError = permanent", () => {
    for (const code of ["P2000", "P2005", "P2006", "P2007", "P2033"]) {
      expect(classifyIngestError(prismaError(code))).toBe("permanent");
    }
    expect(classifyIngestError(Object.assign(new Error("x"), { name: "PrismaClientValidationError" }))).toBe(
      "permanent",
    );
  });

  it("P2039 ທີ່ SQLSTATE ບໍ່ແມ່ນ class 22 (ຫຼືບໍ່ມີ) = transient", () => {
    expect(classifyIngestError(prismaError("P2039", { driverAdapterError: { cause: { code: "53300" } } }))).toBe(
      "transient",
    );
    expect(classifyIngestError(prismaError("P2039"))).toBe("transient");
  });

  it("ເຊື່ອມຕໍ່/pool/deadlock/unique ຊົນ = transient", () => {
    for (const code of ["P1001", "P1002", "P1008", "P1017", "P2024", "P2034", "P2002"]) {
      expect(classifyIngestError(prismaError(code))).toBe("transient");
    }
    expect(classifyIngestError(Object.assign(new Error("x"), { name: "PrismaClientInitializationError" }))).toBe(
      "transient",
    );
  });

  it("error ທີ່ບໍ່ຮູ້ຈັກ (Error ທຳມະດາ, string, null) = transient", () => {
    expect(classifyIngestError(new Error("boom"))).toBe("transient");
    expect(classifyIngestError("boom")).toBe("transient");
    expect(classifyIngestError(null)).toBe("transient");
  });
});
