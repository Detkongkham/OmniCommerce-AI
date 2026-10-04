import { describe, expect, it } from "vitest";
import { type SeedStoreDb, seedStore } from "./seed-store";

interface FakeSetting {
  id: number;
  name: string;
}
interface FakeWarehouse {
  code: string;
  name: string;
  isDefault: boolean;
}

function createFakeDb(initial: { settings?: FakeSetting[]; warehouses?: FakeWarehouse[] } = {}) {
  const settings: FakeSetting[] = [...(initial.settings ?? [])];
  const warehouses: FakeWarehouse[] = [...(initial.warehouses ?? [])];

  const db = {
    storeSetting: {
      upsert: async ({ where, create }: { where: { id: number }; create: FakeSetting }) => {
        const found = settings.find((s) => s.id === where.id);
        if (found) return found;
        settings.push(create);
        return create;
      },
    },
    warehouse: {
      findFirst: async ({ where }: { where: { isDefault: boolean } }) =>
        warehouses.find((w) => w.isDefault === where.isDefault) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { code: string };
        create: FakeWarehouse;
        update: Partial<FakeWarehouse>;
      }) => {
        const found = warehouses.find((w) => w.code === where.code);
        if (found) {
          Object.assign(found, update);
          return found;
        }
        warehouses.push(create);
        return create;
      },
    },
  } as unknown as SeedStoreDb;

  return { db, settings, warehouses };
}

describe("seedStore", () => {
  it("ສ້າງ StoreSetting (id=1) ແລະ ສາງ MAIN ເປັນ default ເມື່ອຍັງບໍ່ມີ", async () => {
    const { db, settings, warehouses } = createFakeDb();
    await seedStore(db, { storeName: "ຮ້ານທົດລອງ" });
    expect(settings).toEqual([{ id: 1, name: "ຮ້ານທົດລອງ" }]);
    expect(warehouses).toEqual([{ code: "MAIN", name: "ສາງຫຼັກ", isDefault: true }]);
  });

  it("run ຊ້ຳບໍ່ສ້າງຊ້ຳ ແລະ ບໍ່ຂຽນທັບຊື່ຮ້ານທີ່ແກ້ແລ້ວ", async () => {
    const { db, settings, warehouses } = createFakeDb();
    await seedStore(db, { storeName: "ຊື່ເດີມ" });
    await seedStore(db, { storeName: "ຊື່ໃໝ່" });
    expect(settings).toHaveLength(1);
    expect(settings[0]?.name).toBe("ຊື່ເດີມ");
    expect(warehouses).toHaveLength(1);
  });

  it("ຖ້າມີສາງ default ຢູ່ແລ້ວ (code ອື່ນ) ບໍ່ສ້າງ MAIN", async () => {
    const { db, warehouses } = createFakeDb({
      warehouses: [{ code: "KV", name: "ສາງວຽງຈັນ", isDefault: true }],
    });
    await seedStore(db, { storeName: "S" });
    expect(warehouses).toEqual([{ code: "KV", name: "ສາງວຽງຈັນ", isDefault: true }]);
  });

  it("ຖ້າມີ MAIN ແຕ່ບໍ່ແມ່ນ default ແລະ ບໍ່ມີ default ອື່ນ ໃຫ້ຕັ້ງ MAIN ເປັນ default", async () => {
    const { db, warehouses } = createFakeDb({
      warehouses: [{ code: "MAIN", name: "ສາງຫຼັກ", isDefault: false }],
    });
    await seedStore(db, { storeName: "S" });
    expect(warehouses[0]?.isDefault).toBe(true);
  });
});
