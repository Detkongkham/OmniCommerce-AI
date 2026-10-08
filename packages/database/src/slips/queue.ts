/** ຄິວ BullMQ ຂອງການອ່ານສະລິບ: API enqueue, worker ປະມວນຜົນ. ຊື່/option ຢູ່ບ່ອນດຽວເພື່ອບໍ່ໃຫ້ສອງຝ່າຍຂັດກັນ. */
export const SLIP_QUEUE_NAME = "slips";
export const SLIP_JOB_READ = "read-slip";

export interface SlipReadJobData {
  slipId: string;
}

export const SLIP_READ_ATTEMPTS = 3;

export const SLIP_READ_JOB_OPTIONS = {
  attempts: SLIP_READ_ATTEMPTS,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: 100,
};
