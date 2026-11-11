import { weekday, type Day } from "./dates";
export type Schedule =
  | { kind: "weekdays"; days: number[] }
  | { kind: "perWeek"; times: number };
export function isDue(schedule: Schedule, day: Day) {
  validateSchedule(schedule);
  const w = weekday(day); // runs first so a bad day throws for every kind
  return schedule.kind === "perWeek" || schedule.days.includes(w);
}
export function validateSchedule(schedule: Schedule) {
  if (schedule.kind === "perWeek") {
    if (!Number.isInteger(schedule.times)) throw Error("Times must be an integer");
    if (schedule.times < 1 || schedule.times > 7) throw Error("times is out of range please verify");
  } else if (schedule.kind === "weekdays") {
    if (!Array.isArray(schedule.days) || schedule.days.length === 0) {
      throw Error("Days must be a non-empty array");
    }
    if (!schedule.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      throw Error("Day is out of range please verify");
    }
  } else {
    throw Error("Please add a correct schedule kind");
  }
}
