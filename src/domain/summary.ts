import { addDays, type Day } from "./dates";
import { isDue, validateSchedule, type Schedule } from "./schedule";

export type DayMark = { day: Day; done: boolean };
export type HabitSchedule = { id: string; schedule: Schedule };
export type Completion = { habitId: string; day: Day };
export type DaySummary = { day: Day; due: number; done: number };

export function lastWeek(completions: Day[], today: Day): DayMark[] {
  completions.forEach((d: Day) => addDays(d, 0)); // addDays validates the day and throws if invalid
  const done = new Set(completions);
  return Array.from({ length: 7 }, (_: unknown, i: number) => {
    const day = addDays(today, i - 6);
    return { day, done: done.has(day) };
  });
}

export function monthSummary(
  habits: HabitSchedule[],
  completions: Completion[],
  month: string,
): DaySummary[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw Error(`Invalid month: ${JSON.stringify(month)}, expected YYYY-MM`);
  }
  if (new Set(habits.map((h: HabitSchedule) => h.id)).size !== habits.length) {
    throw Error("Duplicate habit id");
  }
  habits.forEach((h: HabitSchedule) => validateSchedule(h.schedule));
  completions.forEach((c: Completion) => addDays(c.day, 0)); // validates the day
  const done = new Set(
    completions.map((c: Completion) => `${c.habitId}|${c.day}`),
  );
  const result: DaySummary[] = [];
  for (
    let day = `${month}-01`;
    day.slice(0, 7) === month;
    day = addDays(day, 1)
  ) {
    const due = habits.filter((h: HabitSchedule) => isDue(h.schedule, day));
    result.push({
      day,
      due: due.length,
      done: due.filter((h: HabitSchedule) => done.has(`${h.id}|${day}`)).length,
    });
  }
  return result;
}
