import { BadRequestException } from "@nestjs/common";
import { loginSchema } from "@oca/shared";
import { describe, expect, it } from "vitest";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(loginSchema);

  it("ສົ່ງຄືນຄ່າທີ່ parse ແລ້ວ (ຮວມການ transform)", () => {
    expect(pipe.transform({ email: " A@B.co ", password: "password123" })).toEqual({
      email: "a@b.co",
      password: "password123",
    });
  });

  it("throw 400 ພ້ອມລາຍການ issue ເມື່ອຂໍ້ມູນຜິດ", () => {
    try {
      pipe.transform({ email: "x", password: "short" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as { issues: { path: string }[] };
      expect(body.issues.map((i) => i.path).sort()).toEqual(["email", "password"]);
    }
  });
});
