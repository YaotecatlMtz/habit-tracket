import { describe, expect, it } from "vitest";
import {
  lastWeek,
  monthSummary,
  type Completion,
  type DaySummary,
  type HabitSchedule,
} from "./summary";
import type { Schedule } from "./schedule";

const today = "2026-11-05";
const window = [
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
];
type Mark = { day: string; done: boolean };
const doneDays = (completions: string[], at = today) =>
  lastWeek(completions, at)
    .filter((e: Mark) => e.done)
    .map((e: Mark) => e.day);

describe("lastWeek, shape", () => {
  it("lists the days oldest first, ending today", () => {
    expect(lastWeek([], today).map((e: Mark) => e.day)).toEqual(window);
  });
});

describe("lastWeek, marking done days", () => {
  it("marks several days", () => {
    expect(doneDays(["2026-10-31", "2026-11-03", today])).toEqual([
      "2026-10-31",
      "2026-11-03",
      "2026-11-05",
    ]);
  });
});

describe("lastWeek, window edges", () => {
  it("includes the day 6 days ago", () => {
    expect(doneDays(["2026-10-30"])).toEqual(["2026-10-30"]);
  });

  it("ignores the day 7 days ago", () => {
    expect(doneDays(["2026-10-29"])).toEqual([]);
  });

  it("ignores days after today", () => {
    expect(doneDays(["2026-11-06", "2026-12-01"])).toEqual([]);
  });
});

describe("lastWeek, duplicates", () => {
  it("counts a repeated completion once and still returns 7 entries", () => {
    const result = lastWeek(["2026-11-03", "2026-11-03"], today);
    expect(result).toHaveLength(7);
    expect(result.filter((e: Mark) => e.done)).toEqual([
      { day: "2026-11-03", done: true },
    ]);
  });
});

describe("lastWeek, calendar boundaries", () => {
  it("crosses the end of the year", () => {
    expect(lastWeek([], "2026-01-03").map((e: Mark) => e.day)).toEqual([
      "2025-12-28",
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });
});

describe("lastWeek, invalid input", () => {
  it.each(["garbage"])(
    "throws for invalid today %j",
    (bad: string) => {
      expect(() => lastWeek([], bad)).toThrow();
    },
  );

  it("throws for an invalid day inside completions", () => {
    expect(() => lastWeek(["2026-11-03", "2026-02-30"], today)).toThrow();
    expect(() => lastWeek(["garbage"], today)).toThrow();
  });
});

describe("lastWeek, purity", () => {
  it("does not mutate the completions", () => {
    const completions = [today, "2026-10-31", "2026-11-03"];
    const copy = [...completions];
    lastWeek(completions, today);
    expect(completions).toEqual(copy);
  });
});

const all = [0, 1, 2, 3, 4, 5, 6];
const daily: HabitSchedule = {
  id: "a",
  schedule: { kind: "weekdays", days: all },
};
const daily2: HabitSchedule = {
  id: "b",
  schedule: { kind: "weekdays", days: all },
};
const mwf: HabitSchedule = {
  id: "m",
  schedule: { kind: "weekdays", days: [1, 3, 5] },
};
const pw: HabitSchedule = { id: "p", schedule: { kind: "perWeek", times: 3 } };
const nov = "2026-11";
const entry = (
  habits: HabitSchedule[],
  completions: Completion[],
  day: string,
  month = nov,
) =>
  monthSummary(habits, completions, month).find(
    (e: DaySummary) => e.day === day,
  );
const done = (habitId: string, day: string): Completion => ({ habitId, day });

describe("monthSummary, shape", () => {
  it("lists consecutive days from the first to the last", () => {
    const days = monthSummary([], [], nov).map((e: DaySummary) => e.day);
    expect(days[0]).toBe("2026-11-01");
    expect(days[29]).toBe("2026-11-30");
    expect(days).toEqual(
      Array.from(
        { length: 30 },
        (_, i: number) => `2026-11-${String(i + 1).padStart(2, "0")}`,
      ),
    );
  });

  it("is all zeros with no habits", () => {
    const result = monthSummary([], [], nov);
    expect(result.every((e: DaySummary) => e.due === 0 && e.done === 0)).toBe(
      true,
    );
  });
});

describe("monthSummary, due habits", () => {
  it("a daily habit is due every day", () => {
    expect(
      monthSummary([daily], [], nov).every((e: DaySummary) => e.due === 1),
    ).toBe(true);
  });

  it("a Mon/Wed/Fri habit is due only on those days", () => {
    expect(entry([mwf], [], "2026-11-02")?.due).toBe(1);
    expect(entry([mwf], [], "2026-11-04")?.due).toBe(1);
    expect(entry([mwf], [], "2026-11-06")?.due).toBe(1);
    expect(entry([mwf], [], "2026-11-01")?.due).toBe(0);
    expect(entry([mwf], [], "2026-11-03")?.due).toBe(0);
  });

  it("a perWeek habit is due every day", () => {
    const result = monthSummary([pw], [], nov);
    expect(result).toHaveLength(30);
    expect(result.every((e: DaySummary) => e.due === 1)).toBe(true);
  });
});

describe("monthSummary, habit lifetime", () => {
  it("is not due before the day it was created", () => {
    const created = { ...daily, from: "2026-11-15" };
    expect(entry([created], [], "2026-11-14")?.due).toBe(0);
    expect(entry([created], [], "2026-11-15")?.due).toBe(1);
  });

  it("is not due from the day it was archived", () => {
    const archived = { ...daily, to: "2026-11-15" };
    expect(entry([archived], [], "2026-11-14")?.due).toBe(1);
    expect(entry([archived], [], "2026-11-15")?.due).toBe(0);
  });

  it("keeps the completions of an archived habit", () => {
    const archived = { ...daily, to: "2026-11-15" };
    expect(
      entry([archived], [done("a", "2026-11-10")], "2026-11-10")?.done,
    ).toBe(1);
  });

  it("throws for an invalid from or to", () => {
    expect(() =>
      monthSummary([{ ...daily, from: "2026-13-01" }], [], nov),
    ).toThrow(/invalid day/i);
    expect(() => monthSummary([{ ...daily, to: "nope" }], [], nov)).toThrow(
      /invalid day/i,
    );
  });
});

describe("monthSummary, done habits", () => {
  it("counts a completion on its day only", () => {
    const completions = [done("a", "2026-11-05")];
    expect(entry([daily], completions, "2026-11-05")).toEqual({
      day: "2026-11-05",
      due: 1,
      done: 1,
    });
    expect(entry([daily], completions, "2026-11-04")).toEqual({
      day: "2026-11-04",
      due: 1,
      done: 0,
    });
  });

  it("mixes daily, perWeek and completions", () => {
    const completions = [done("a", "2026-11-05"), done("b", "2026-11-05")];
    expect(entry([daily, daily2, pw], completions, "2026-11-05")).toEqual({
      day: "2026-11-05",
      due: 3,
      done: 2,
    });
  });

  it("ignores completions of unknown habits", () => {
    expect(entry([daily], [done("zzz", "2026-11-05")], "2026-11-05")).toEqual({
      day: "2026-11-05",
      due: 1,
      done: 0,
    });
  });

  it("ignores a completion on a day the habit is not due", () => {
    expect(entry([mwf], [done("m", "2026-11-03")], "2026-11-03")).toEqual({
      day: "2026-11-03",
      due: 0,
      done: 0,
    });
  });
});

describe("monthSummary, duplicates", () => {
  it("counts a repeated completion once", () => {
    const completions = [done("a", "2026-11-05"), done("a", "2026-11-05")];
    expect(entry([daily], completions, "2026-11-05")?.done).toBe(1);
  });
});

describe("monthSummary, calendar boundaries", () => {
  it("ignores completions outside the month", () => {
    const completions = [done("a", "2026-10-31"), done("a", "2026-12-01")];
    const result = monthSummary([daily], completions, nov);
    expect(result.every((e: DaySummary) => e.done === 0)).toBe(true);
  });

  it("counts completions on the first and last day", () => {
    const completions = [done("a", "2026-11-01"), done("a", "2026-11-30")];
    const result = monthSummary([daily], completions, nov);
    expect(result[0]).toEqual({ day: "2026-11-01", due: 1, done: 1 });
    expect(result[29]).toEqual({ day: "2026-11-30", due: 1, done: 1 });
  });

  it.each<[string, number, string]>([
    ["2026-02", 28, "2026-02-28"],
    ["2028-02", 29, "2028-02-29"],
    ["2100-02", 28, "2100-02-28"],
    ["2026-04", 30, "2026-04-30"],
    ["2026-12", 31, "2026-12-31"],
  ])(
    "%s has %i days, the last one %s",
    (month: string, length: number, last: string) => {
      const result = monthSummary([], [], month);
      expect(result).toHaveLength(length);
      expect(result[length - 1].day).toBe(last);
    },
  );

  it("uses the right weekday across the year boundary", () => {
    expect(monthSummary([mwf], [], "2026-12")[30].due).toBe(0); // Thursday
    expect(monthSummary([mwf], [], "2027-01")[0].due).toBe(1); // Friday
  });
});

describe("monthSummary, invalid input", () => {
  it.each(["2026-13", "2026-00", "2026-1", "2026-11-05", "", "Nov 2026"])(
    "throws for invalid month %j",
    (bad: string) => {
      expect(() => monthSummary([daily], [], bad)).toThrow();
    },
  );

  it.each(["2026-02-30", "not-a-day"])(
    "throws for invalid completion day %j",
    (bad: string) => {
      expect(() => monthSummary([daily], [done("a", bad)], nov)).toThrow();
      expect(() =>
        monthSummary([daily], [done("a", bad)], "2026-02"),
      ).toThrow();
      expect(() => monthSummary([], [done("a", bad)], nov)).toThrow();
    },
  );

  it("throws for duplicate habit ids", () => {
    expect(() => monthSummary([daily, daily], [], nov)).toThrow();
  });

  it.each<[string, Schedule]>([
    ["unknown kind", { kind: "monthly" } as unknown as Schedule],
  ])(
    "throws for an invalid schedule: %s",
    (_name: string, schedule: Schedule) => {
      expect(() => monthSummary([{ id: "x", schedule }], [], nov)).toThrow();
    },
  );
});

describe("monthSummary, purity", () => {
  it("does not mutate its inputs", () => {
    const habits = [daily, mwf, pw];
    const completions = [done("a", "2026-11-05"), done("m", "2026-11-04")];
    const habitsCopy = structuredClone(habits);
    const completionsCopy = structuredClone(completions);
    monthSummary(habits, completions, nov);
    expect(habits).toEqual(habitsCopy);
    expect(completions).toEqual(completionsCopy);
  });
});
