import { describe, expect, it } from "vitest";
import { isDue, validateSchedule, type Schedule } from "./schedule";

// Tests pass wrong shapes on purpose, as untyped input from outside would.
const bad = (value: unknown) => value as Parameters<typeof validateSchedule>[0];

describe("isDue", () => {
  it("returns correct values for weekdays", () => {
    expect(isDue({ kind: "weekdays", days: [1] }, "2026-11-09")).toBe(true);
    expect(isDue({ kind: "weekdays", days: [2] }, "2026-11-04")).toBe(false);
  });
  it("returns correct values for perWeek", () => {
    expect(isDue({ kind: "perWeek", times: 3 }, "2026-11-03")).toBe(true);
    expect(isDue({ kind: "perWeek", times: 2 }, "2026-11-04")).toBe(true);
  });
});

describe("isDue with several days", () => {
  it("is due on any listed day and not on the others", () => {
    const schedule: Schedule = { kind: "weekdays", days: [1, 3, 5] };
    expect(["2026-11-09", "2026-11-11", "2026-11-13"].map((d) => isDue(schedule, d))).toEqual([true, true, true]);
    expect(["2026-11-08", "2026-11-10", "2026-11-12", "2026-11-14"].map((d) => isDue(schedule, d))).toEqual([false, false, false, false]);
  });
});

describe("isDue with a bad day", () => {
  const schedules: Schedule[] = [
    { kind: "weekdays", days: [1] },
    { kind: "perWeek", times: 3 },
  ];
  it.each(schedules)("throws for $kind", (schedule) => {
    expect(() => isDue(schedule, "garbage")).toThrow("Invalid day");
  });
});

describe("validateSchedule", () => {
  it("Validate faulty scenarios for weekdays-days", () => {
    expect(() =>
      validateSchedule({ kind: "weekdays", days: [1, 1, 2, 2, 3, 3, 4, 4] }),
    ).not.toThrow();
    expect(() =>
      validateSchedule({ kind: "weekdays", days: [2] }),
    ).not.toThrow();
    expect(() => validateSchedule({ kind: "weekdays", days: [-1] })).toThrow(
      Error("Day is out of range please verify"),
    );
    expect(() => validateSchedule({ kind: "weekdays", days: [7] })).toThrow(
      Error("Day is out of range please verify"),
    );
    expect(() => validateSchedule({ kind: "weekdays", days: [] })).toThrow(
      Error("Days must be a non-empty array"),
    );
  });

  it("Validate faulty scenarios for perweek-times", () => {
    expect(() => validateSchedule(bad({ kind: "perWeek", times: "3" }))).toThrow(
      Error("Times must be an integer"),
    );
    expect(() => validateSchedule(bad({ kind: "perWeek", times: [] }))).toThrow(
      Error("Times must be an integer"),
    );
  });

  it("accepts the limits of times and days", () => {
    for (const times of [1, 7]) expect(() => validateSchedule({ kind: "perWeek", times })).not.toThrow();
    expect(() => validateSchedule({ kind: "weekdays", days: [0, 6] })).not.toThrow();
  });

  it("rejects times just outside the limits and non-integers", () => {
    for (const times of [8, -1, 2.5, NaN]) {
      expect(() => validateSchedule({ kind: "perWeek", times })).toThrow(/Times must be|out of range/);
    }
  });

  it("rejects a fractional day", () => {
    expect(() => validateSchedule({ kind: "weekdays", days: [1, 1.5] })).toThrow("Day is out of range please verify");
  });

  it("Validates wrong combinations for kind-days-times", () => {
    expect(() => validateSchedule(bad({ kind: "wrongKind", days: 3 }))).toThrow(
      Error("Please add a correct schedule kind"),
    );
    expect(() => validateSchedule(bad({ kind: "perWeek", days: 3 }))).toThrow(
      Error("Times must be an integer"),
    );
    expect(() => validateSchedule(bad({ kind: "weekdays", times: 3 }))).toThrow(
      Error("Days must be a non-empty array"),
    );
    expect(() => validateSchedule({ kind: "perWeek", times: 0 })).toThrow(
      Error("times is out of range please verify"),
    );
  });

});
