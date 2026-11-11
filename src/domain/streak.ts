import { addDays, weekday, weekStart, type Day } from "./dates";
import { isDue, validateSchedule, type Schedule } from "./schedule";

function dueDays(completions: Day[], schedule: Schedule, until?: Day) {
  validateSchedule(schedule);
  return [...new Set(completions)]
    .filter((d) => isDue(schedule, d))
    .filter((d) => !until || d <= until)
    .sort();
}

function metWeeks(days: Day[], times: number) {
  const counts = new Map<Day, number>();
  for (const d of days)
    counts.set(weekStart(d), (counts.get(weekStart(d)) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= times).map(([w]) => w));
}

export function currentStreak(
  completions: Day[],
  schedule: Schedule,
  today: Day,
) {
  weekday(today);
  const days = dueDays(completions, schedule, today);

  if (schedule.kind === "perWeek") {
    const met = metWeeks(days, schedule.times);
    let w = weekStart(today);
    let streak = met.has(w) ? 1 : 0; // the current, unfinished week never breaks it
    for (w = addDays(w, -7); met.has(w); w = addDays(w, -7)) streak++;
    return streak;
  }

  const done = new Set(days);
  let streak = 0;
  for (let d = today; days.length && d >= days[0]; d = addDays(d, -1)) {
    if (!isDue(schedule, d)) continue;
    if (done.has(d)) streak++;
    else if (d !== today) break; // today not done yet is still open
  }
  return streak;
}

export function longestStreak(completions: Day[], schedule: Schedule) {
  const days = dueDays(completions, schedule);
  let best = 0;
  let run = 0;

  if (schedule.kind === "perWeek") {
    let prev = "";
    for (const w of [...metWeeks(days, schedule.times)].sort()) {
      run = prev && addDays(prev, 7) === w ? run + 1 : 1;
      best = Math.max(best, run);
      prev = w;
    }
    return best;
  }

  const done = new Set(days);
  for (
    let d = days[0];
    days.length && d <= days[days.length - 1];
    d = addDays(d, 1)
  ) {
    if (!isDue(schedule, d)) continue;
    run = done.has(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
