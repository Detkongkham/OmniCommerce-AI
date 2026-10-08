import { describe, expect, it } from "vitest";
import {
  currentLaosMonth,
  groupPostsByDay,
  laosDateKey,
  laosLocalToIso,
  laosTime,
  mediaSrc,
  monthGrid,
  monthRange,
  shiftMonth,
  toLaosLocal,
} from "./posts";

describe("mediaSrc", () => {
  it("ໄຟລ໌ທີ່ອັບໂຫຼດຜ່ານ /api; URL ພາຍນອກຄືເກົ່າ", () => {
    expect(mediaSrc("/media/files/abc.png")).toBe("/api/media/files/abc.png");
    expect(mediaSrc("https://cdn.test/a.jpg")).toBe("https://cdn.test/a.jpg");
  });
});

describe("ເວລາລາວ", () => {
  it("datetime-local ↔ ISO (UTC+7)", () => {
    expect(laosLocalToIso("2026-10-09T08:30")).toBe("2026-10-09T01:30:00.000Z");
    expect(laosLocalToIso("2026-10-09T03:00")).toBe("2026-10-08T20:00:00.000Z");
    expect(toLaosLocal("2026-10-08T20:00:00.000Z")).toBe("2026-10-09T03:00");
    expect(laosLocalToIso("2026-02-30T10:00")).toBeNull();
    expect(laosLocalToIso("")).toBeNull();
    expect(laosLocalToIso("2026-10-09 08:30")).toBeNull();
  });

  it("ວັນທີ/ເວລາຕາມເວລາລາວ (ຂ້າມວັນ)", () => {
    expect(laosDateKey("2026-10-31T18:00:00.000Z")).toBe("2026-11-01");
    expect(laosTime("2026-10-31T18:05:00.000Z")).toBe("01:05");
  });

  it("ເດືອນປັດຈຸບັນ / ເລື່ອນເດືອນ / ຊ່ວງເດືອນ", () => {
    expect(currentLaosMonth(new Date("2026-12-31T17:30:00.000Z"))).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(monthRange({ year: 2026, month: 9 })).toEqual({ from: "2026-09-30T17:00:00.000Z", to: "2026-10-31T17:00:00.000Z" });
  });

  it("monthGrid: 42 ວັນ ເລີ່ມວັນຈັນ", () => {
    const grid = monthGrid({ year: 2026, month: 9 }); // 1 ຕ.ລ. 2026 = ວັນພະຫັດ
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ key: "2026-09-28", day: 28, inMonth: false });
    expect(grid[3]).toEqual({ key: "2026-10-01", day: 1, inMonth: true });
    expect(grid.filter((day) => day.inMonth)).toHaveLength(31);
  });

  it("groupPostsByDay: ໃຊ້ publishedAt ກ່ອນ scheduledAt, ຂ້າມຮ່າງ, ລຽງຕາມເວລາ", () => {
    const posts = [
      { id: "b", publishedAt: null, scheduledAt: "2026-10-09T05:00:00.000Z" },
      { id: "a", publishedAt: "2026-10-09T01:00:00.000Z", scheduledAt: "2026-10-01T01:00:00.000Z" },
      { id: "draft", publishedAt: null, scheduledAt: null },
      { id: "c", publishedAt: null, scheduledAt: "2026-10-09T18:00:00.000Z" },
    ];
    const groups = groupPostsByDay(posts);
    expect(groups.get("2026-10-09")?.map((post) => post.id)).toEqual(["a", "b"]);
    expect(groups.get("2026-10-10")?.map((post) => post.id)).toEqual(["c"]);
    expect(groups.has("2026-10-01")).toBe(false);
  });
});
