import { describe, expect, it } from "vitest";
import { toDayKey, weekday, addDays, weekStart } from "./dates";

describe("toDayKey", () => {
  it("formats an instant as YYYY-MM-DD", () => {
    expect(toDayKey(new Date("2026-11-03T03:00:00Z"), "UTC")).toBe("2026-11-03");
    expect(toDayKey(new Date("1900-11-06T03:00:00Z"), "UTC")).toBe("1900-11-06");
    expect(toDayKey(new Date("2026-01-05T12:00:00Z"), "UTC")).toBe("2026-01-05");
    expect(toDayKey(new Date("2024-02-29T12:00:00Z"), "UTC")).toBe("2024-02-29");
  });

  it("uses the day in the given time zone, not the UTC day", () => {
    const instant = new Date("2026-11-06T03:00:00Z"); // 21:00 on 5 Nov in Mexico City
    expect(toDayKey(instant, "America/Mexico_City")).toBe("2026-11-05");
    expect(toDayKey(instant, "UTC")).toBe("2026-11-06");
    expect(toDayKey(new Date("2026-11-05T23:30:00Z"), "Europe/Madrid")).toBe("2026-11-06");
  });

  it("throws on an invalid Date or time zone", () => {
    expect(() => toDayKey(new Date("x"), "UTC")).toThrow(RangeError);
    expect(() => toDayKey(new Date(), "Nowhere/Land")).toThrow(RangeError);
  });
});

describe("weekday", () => {
  it("returns 0 for Sunday through 6 for Saturday", () => {
    for (let i = 0; i <= 6; i++) expect(weekday(`2026-11-0${i + 1}`)).toBe(i);
  });
});

describe("addDays", () => {
  it("crosses month, year and leap boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  });

  it("returns the same day when adding 0", () => {
    expect(addDays("2026-04-30", 0)).toBe("2026-04-30");
  });

  it("crosses daylight-saving dates without drifting", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("handles big jumps in both directions", () => {
    expect(addDays("2026-01-01", 400)).toBe("2027-02-05");
    expect(addDays("2026-01-01", -365)).toBe("2025-01-01");
  });

  it.each([Infinity, NaN, 1.5])("rejects %s days", (n) => {
    expect(() => addDays("2026-01-01", n)).toThrow("Invalid number of days");
  });
});

describe("weekStart", () => {
  it("returns the same Monday for all 7 days of a week", () => {
    for (let d = 2; d <= 8; d++) expect(weekStart(`2026-11-0${d}`)).toBe("2026-11-02");
  });

  it("crosses month and year boundaries", () => {
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(weekStart("2026-01-01")).toBe("2025-12-29");
  });
});

describe("day format", () => {
  it.each(["ErrorTest", "2026-11-5", "2026-02-30", "2026-02-300", "2026-11-05T10:00:00Z", ""])(
    "rejects %j",
    (bad) => {
      expect(() => weekday(bad)).toThrow("Invalid day");
      expect(() => addDays(bad, 1)).toThrow("Invalid day");
      expect(() => weekStart(bad)).toThrow("Invalid day");
    },
  );
});
