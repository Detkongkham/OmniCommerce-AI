import { FakeSlipReader, type FakeSlipFields } from "./fake-slip-reader";
import type { SlipReader } from "./slip-reader";

/** ເລືອກ reader ຈາກ env. ຂັ້ນ 1 ມີແຕ່ `fake`; reader ຈິງຈະເພີ່ມໃນຂັ້ນ 2 (ຫຼັງ bake-off). */
export function createSlipReader(env: Record<string, string | undefined>): SlipReader {
  const name = env.SLIP_READER ?? "fake";
  if (name === "fake") {
    let fields: FakeSlipFields = {};
    if (env.SLIP_FAKE_RESULT) {
      try {
        fields = JSON.parse(env.SLIP_FAKE_RESULT) as FakeSlipFields;
      } catch {
        throw new Error("SLIP_FAKE_RESULT must be valid JSON");
      }
    }
    return new FakeSlipReader(fields);
  }
  throw new Error(`Unknown SLIP_READER: ${name}`);
}
