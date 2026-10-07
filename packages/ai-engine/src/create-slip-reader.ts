import { FakeSlipReader, type FakeSlipFields } from "./fake-slip-reader";
import type { SlipReader } from "./slip-reader";

const FAKE_KEYS = ["amount", "currency", "paidAt", "destAccount", "refNo"] as const;
const FAKE_RESULT_ERROR =
  "SLIP_FAKE_RESULT must be a JSON object with string fields amount, currency, paidAt, destAccount, refNo";

/** ກວດວ່າເປັນ object ທຳມະດາ, ມີແຕ່ key ທີ່ຮູ້ຈັກ ແລະ ທຸກຄ່າເປັນສະຕຣິງ */
function parseFakeFields(text: string): FakeSlipFields {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("SLIP_FAKE_RESULT must be valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(FAKE_RESULT_ERROR);
  }
  for (const [key, v] of Object.entries(value)) {
    if (!(FAKE_KEYS as readonly string[]).includes(key) || typeof v !== "string") {
      throw new Error(FAKE_RESULT_ERROR);
    }
  }
  return value as FakeSlipFields;
}

/** ເລືອກ reader ຈາກ env. ຂັ້ນ 1 ມີແຕ່ `fake`; reader ຈິງຈະເພີ່ມໃນຂັ້ນ 2 (ຫຼັງ bake-off). */
export function createSlipReader(env: Record<string, string | undefined>): SlipReader {
  const name = env.SLIP_READER ?? "fake";
  if (name === "fake") {
    let fields: FakeSlipFields = {};
    if (env.SLIP_FAKE_RESULT) fields = parseFakeFields(env.SLIP_FAKE_RESULT);
    return new FakeSlipReader(fields);
  }
  throw new Error(`Unknown SLIP_READER: ${name}`);
}
