import { describe, expect, it } from "vitest";
import { SLIP_JOB_READ, SLIP_QUEUE_NAME, SLIP_READ_ATTEMPTS, SLIP_READ_JOB_OPTIONS } from "./queue";

describe("slip queue constants", () => {
  it("ຊື່ຄິວ/job ຄົງທີ່ (API ແລະ worker ຕ້ອງຕົງກັນ)", () => {
    expect(SLIP_QUEUE_NAME).toBe("slips");
    expect(SLIP_JOB_READ).toBe("read-slip");
  });
  it("job ລອງ 3 ຄັ້ງ ແບບ exponential ແລະ ລຶບເມື່ອສຳເລັດ", () => {
    expect(SLIP_READ_ATTEMPTS).toBe(3);
    expect(SLIP_READ_JOB_OPTIONS).toMatchObject({ attempts: 3, backoff: { type: "exponential" }, removeOnComplete: true });
  });
});
