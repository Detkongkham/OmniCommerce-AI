import type { SlipImage, SlipReadResult, SlipReader } from "./slip-reader";

export type FakeSlipFields = Partial<Omit<SlipReadResult, "raw">>;

/** reader ສຳລັບ test/dev: ຄືນຜົນຄົງທີ່ (ຄ່າເລີ່ມຕົ້ນວ່າງ ເພື່ອໃຫ້ແອດມິນຕື່ມມື ແລ້ວໃຊ້ງານໄດ້ໂດຍບໍ່ມີ AI) */
export class FakeSlipReader implements SlipReader {
  readonly name = "fake";
  readonly version = "1";

  constructor(
    private readonly fields: FakeSlipFields = {},
    private readonly options: { failWith?: string } = {},
  ) {}

  async read(_image: SlipImage): Promise<SlipReadResult> {
    if (this.options.failWith) throw new Error(this.options.failWith);
    return { ...this.fields, raw: { ...this.fields } };
  }
}
