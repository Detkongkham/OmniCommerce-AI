import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";
import { defaultCodeForStatus } from "./api-error";

/** ເຕີມ `statusCode` ແລະ `code` ໃຫ້ທຸກ HttpException ທີ່ຍັງບໍ່ມີ (guard, ZodValidationPipe, Nest ເອງ) ໂດຍບໍ່ປ່ຽນ field ອື່ນ. */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter<HttpException> {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const body: Record<string, unknown> =
      typeof raw === "string" ? { statusCode: status, message: raw } : { ...(raw as Record<string, unknown>) };
    if (typeof body.statusCode !== "number") body.statusCode = status;
    if (typeof body.code !== "string") {
      body.code = Array.isArray(body.issues) ? "VALIDATION_FAILED" : defaultCodeForStatus(status);
    }
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
