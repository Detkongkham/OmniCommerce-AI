import { type ArgumentsHost, Catch, HttpException, HttpStatus } from "@nestjs/common";
import { apiError } from "../../common/api-error";
import { HttpExceptionFilter } from "../../common/http-exception.filter";

/** ແປງ error ຂອງ multer (ໄຟລ໌ໃຫຍ່ເກີນ → 413, field ຜິດ/ຮູບແບບ multipart ຜິດ → 400) ເປັນ `MEDIA_INVALID`; error ທີ່ມີ code ແລ້ວຜ່ານໄປຄືເກົ່າ */
@Catch(HttpException)
export class MediaUploadErrorFilter extends HttpExceptionFilter {
  override catch(exception: HttpException, host: ArgumentsHost): void {
    const raw = exception.getResponse();
    const hasCode = typeof raw === "object" && raw !== null && typeof (raw as { code?: unknown }).code === "string";
    const status = exception.getStatus();
    if (!hasCode && status === HttpStatus.PAYLOAD_TOO_LARGE) {
      super.catch(apiError("MEDIA_INVALID", "File is too large", { reason: "SIZE" }), host);
      return;
    }
    if (!hasCode && status === HttpStatus.BAD_REQUEST) {
      super.catch(apiError("MEDIA_INVALID", "Expected one multipart file in field \"file\"", { reason: "MISSING" }), host);
      return;
    }
    super.catch(exception, host);
  }
}
