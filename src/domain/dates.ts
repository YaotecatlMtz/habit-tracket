export type Day = string;

export function toDayKey(instant: Date, timeZone: string): Day {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function parseDay(day: Day) {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== day
  ) {
    throw Error(`Invalid day: ${JSON.stringify(day)}, expected YYYY-MM-DD`);
  }
  return parsed;
}

export function weekday(day: Day) {
  return parseDay(day).getUTCDay();
}

export function addDays(day: Day, n: number): Day {
  if (!Number.isInteger(n)) throw Error(`Invalid number of days: ${n}`);
  const result = parseDay(day);
  result.setUTCDate(result.getUTCDate() + n);
  return result.toISOString().slice(0, 10);
}

export function weekStart(day: Day): Day {
  return addDays(day, -((weekday(day) + 6) % 7));
}
