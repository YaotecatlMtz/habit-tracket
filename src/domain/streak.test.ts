import { describe, expect, it } from "vitest";
import { currentStreak, longestStreak } from "./streak";
import type { Schedule } from "./schedule";
// currentStreak(completions, schedule, today)
// longestStreak(completions, schedule)

// Calendar used below (2026): Mon 2 Nov, Wed 4, Fri 6, Mon 9, Wed 11 (today in perWeek tests)
const mwf: Schedule = { kind: "weekdays", days: [1, 3, 5] };
const three: Schedule = { kind: "perWeek", times: 3 };

describe("currentStreak, weekdays", () => {
  const today = "2026-11-06"; // Friday

  it("is 0 with no completions", () => {
    expect(currentStreak([], mwf, today)).toBe(0);
  });

  it("is 1 when only today's due day is done", () => {
    expect(currentStreak(["2026-11-06"], mwf, today)).toBe(1);
  });

  it("counts consecutive due days, skipping non-due days in between", () => {
    const done = ["2026-10-30", "2026-11-02", "2026-11-04", "2026-11-06"];
    expect(currentStreak(done, mwf, today)).toBe(4);
  });

  it("breaks on a missed due day", () => {
    expect(currentStreak(["2026-11-02", "2026-11-06"], mwf, today)).toBe(1);
  });

  it("does not break when today is due but not done yet", () => {
    expect(currentStreak(["2026-11-02", "2026-11-04"], mwf, today)).toBe(2);
  });

  it("counts from the last due day when today is not due", () => {
    const done = ["2026-11-02", "2026-11-04", "2026-11-06"];
    expect(currentStreak(done, mwf, "2026-11-07")).toBe(3); // Saturday
  });

  it("is 0 when today is not due and the last due day was missed", () => {
    expect(currentStreak(["2026-11-02", "2026-11-04"], mwf, "2026-11-07")).toBe(
      0,
    );
  });

  it("counts duplicate completions once", () => {
    expect(
      currentStreak(["2026-11-06", "2026-11-06", "2026-11-06"], mwf, today),
    ).toBe(1);
  });

  it("does not depend on the order of completions", () => {
    expect(
      currentStreak(["2026-11-06", "2026-11-02", "2026-11-04"], mwf, today),
    ).toBe(3);
  });

  it("ignores completions on non-due days", () => {
    expect(currentStreak(["2026-11-05", "2026-11-06"], mwf, today)).toBe(1); // Thursday isn't due
  });

  it("ignores completions after today", () => {
    const done = ["2026-11-02", "2026-11-04", "2026-11-06"];
    expect(currentStreak(done, mwf, "2026-11-04")).toBe(2);
  });

  it("works across a year boundary", () => {
    const done = ["2026-12-30", "2027-01-01", "2027-01-04"];
    expect(currentStreak(done, mwf, "2027-01-04")).toBe(3);
  });
});

describe("currentStreak, perWeek", () => {
  const today = "2026-11-11"; // Wednesday, week of 9 Nov

  it("is 0 with no completions", () => {
    expect(currentStreak([], three, today)).toBe(0);
  });

  it("counts a week that met the goal", () => {
    const done = ["2026-11-02", "2026-11-03", "2026-11-04"];
    expect(currentStreak(done, three, today)).toBe(1);
  });

  it("counts consecutive weeks that met the goal", () => {
    const done = [
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ];
    expect(currentStreak(done, three, today)).toBe(2);
  });

  it("breaks on a past week below the goal", () => {
    const done = [
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-11-02",
      "2026-11-03",
    ];
    expect(currentStreak(done, three, today)).toBe(0);
  });

  it("does not break when the current week is unfinished", () => {
    const done = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-09"];
    expect(currentStreak(done, three, today)).toBe(1);
  });

  it("adds the current week once it met the goal", () => {
    const done = [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
    ];
    expect(currentStreak(done, three, today)).toBe(2);
  });

  it("counts a week once even with more completions than the goal", () => {
    const done = [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ];
    expect(currentStreak(done, three, today)).toBe(1);
  });

  it("starts weeks on Monday: Fri-Sat-Sun is one week", () => {
    expect(
      currentStreak(["2026-11-06", "2026-11-07", "2026-11-08"], three, today),
    ).toBe(1);
  });

  it("starts weeks on Monday: Sunday and the next Monday are different weeks", () => {
    expect(
      currentStreak(["2026-11-08", "2026-11-09", "2026-11-10"], three, today),
    ).toBe(0);
  });

  it("counts the same day once toward the weekly goal", () => {
    const done = ["2026-11-02", "2026-11-02", "2026-11-02"];
    expect(currentStreak(done, three, today)).toBe(0);
  });
});

describe("longestStreak", () => {
  it("is 0 with no completions", () => {
    expect(longestStreak([], mwf)).toBe(0);
    expect(longestStreak([], three)).toBe(0);
  });

  it("returns the length of a single run", () => {
    expect(longestStreak(["2026-11-02", "2026-11-04", "2026-11-06"], mwf)).toBe(
      3,
    );
  });

  it("keeps an older, longer run over a recent shorter one", () => {
    const done = [
      "2026-10-26",
      "2026-10-28",
      "2026-10-30",
      "2026-11-02",
      "2026-11-06",
    ];
    expect(longestStreak(done, mwf)).toBe(4);
  });

  it("splits runs on a missed due day", () => {
    expect(longestStreak(["2026-11-02", "2026-11-06"], mwf)).toBe(1);
  });

  it("ignores duplicates and input order", () => {
    expect(
      longestStreak(
        ["2026-11-06", "2026-11-02", "2026-11-04", "2026-11-04"],
        mwf,
      ),
    ).toBe(3);
  });

  it("counts consecutive weeks that met the goal (perWeek)", () => {
    const done = [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-11-03", // short week splits the runs
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
    ];
    expect(longestStreak(done, three)).toBe(2);
  });

  it("is never lower than the current streak", () => {
    const done = ["2026-11-02", "2026-11-04", "2026-11-06"];
    expect(longestStreak(done, mwf)).toBeGreaterThanOrEqual(
      currentStreak(done, mwf, "2026-11-06"),
    );
  });
});

describe("invalid input", () => {
  it("throws on an invalid completion day", () => {
    expect(() => currentStreak(["nope"], mwf, "2026-11-06")).toThrow();
    expect(() => longestStreak(["2026-02-30"], mwf)).toThrow();
  });

  it("throws on an invalid today", () => {
    expect(() => currentStreak([], mwf, "2026-13-01")).toThrow();
  });

  it("throws on an invalid schedule", () => {
    expect(() =>
      currentStreak([], { kind: "perWeek", times: 0 }, "2026-11-06"),
    ).toThrow();
    expect(() => longestStreak([], { kind: "weekdays", days: [] })).toThrow();
  });
});
