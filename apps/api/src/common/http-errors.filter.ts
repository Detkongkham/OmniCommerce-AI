import { type ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Response } from "express";
import { defaultCodeForStatus } from "./api-error";
import { HttpExceptionFilter } from "./http-exception.filter";

function clientStatusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { statusCode, status } = error as { statusCode?: unknown; status?: unknown };
  const value = typeof statusCode === "number" ? statusCode : status;
  return typeof value === "number" && Number.isInteger(value) && value >= 400 && value < 500 ? value : undefined;
}

/**
 * ຂໍ້ຜິດພາດ 4xx ແບບ http-errors ທີ່ບໍ່ແມ່ນ HttpException (ເຊັ່ນ PayloadTooLargeError ຈາກ body-parser) ໃຫ້ມີ `code` ຄືກັນ.
 * ເປັນ catch-all ຈຶ່ງສົ່ງຕໍ່ກໍລະນີອື່ນໃຫ້ເສັ້ນທາງເດີມ ເພື່ອບໍ່ໃຫ້ລຳດັບ filter ມີຜົນ:
 * HttpException → HttpExceptionFilter, error ອື່ນ/5xx → ພຶດຕິກຳ default ຂອງ Nest (500 + log).
 */
@Catch()
export class HttpErrorsFilter extends BaseExceptionFilter {
  private readonly httpException = new HttpExceptionFilter();

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException) return this.httpException.catch(exception, host);
    const status = clientStatusOf(exception);
    if (status === undefined) return super.catch(exception, host);
    const message = exception instanceof Error ? exception.message : "Request failed";
    // ບໍ່ເພີ່ມ code ໃໝ່: ໃຊ້ code ທົ່ວໄປຕາມ status (BAD_REQUEST ສຳລັບ 4xx ທີ່ບໍ່ມີ code ສະເພາະ, ລວມ 413)
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, code: defaultCodeForStatus(status), message });
  }
}
