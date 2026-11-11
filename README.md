# Habit Tracker

A TDD practice project with Next.js, React, TypeScript and MongoDB (via Mongoose). You create habits that are due on chosen weekdays or N times per week, check them off each day, and see them on a monthly calendar and on cards with the last week. Autumn theme (orange, brown, beige).

## Commands

```bash
cp .env.example .env.local   # once
docker compose up -d         # local Mongo for the dev server and e2e
npm run dev                  # http://localhost:3000

npm test                     # all Vitest tests, once
npm run test:watch           # Vitest in watch mode: keep this open while you do TDD
npm run e2e                  # Playwright (starts the dev server for you)
```

## Where tests go

| Layer | File pattern | Runs in | Sample |
|---|---|---|---|
| Domain logic (pure functions) | `src/**/*.test.ts` | Node | `src/domain/dates.test.ts` |
| Repositories (Mongo) | `src/**/*.test.ts` | Node + in-memory Mongo | none yet |
| Components | `src/**/*.test.tsx` | jsdom + React Testing Library | none yet |
| End-to-end | `e2e/*.spec.ts` | Real browser | none yet |

`.ts` vs `.tsx` decides the environment (see `vitest.config.mts`). Each test sits next to its source: `streaks.ts` + `streaks.test.ts`.
Mongoose models use one shared connection. The app calls `await connectDb()` from `src/lib/db.ts` before querying; tests point `MONGODB_URI` at the in-memory server first.
Define models as `mongoose.models.Habit ?? mongoose.model("Habit", schema)`, or Next.js hot reload throws "Cannot overwrite model once compiled".

`src/app` doesn't exist yet, so `npm run dev` and `npm run e2e` fail until you create `src/app/layout.tsx` and `src/app/page.tsx` (Phase 4).

### Target structure

Don't create folders ahead of time: each one appears with its first failing test.

```
e2e/habits.spec.ts
src/
├── lib/db.ts                 connectDb()
├── domain/                   Phase 1: pure functions
│   ├── dates.ts              toDayKey, weekday, addDays, weekStart (plain functions; a day is a `"YYYY-MM-DD"` string, `toDayKey` is the only one that takes a `Date`)
│   ├── schedule.ts           isDue, validateSchedule
│   ├── streaks.ts            currentStreak, longestStreak
│   └── summary.ts            lastWeek (card), monthSummary (calendar)
├── repositories/             Phase 2: one Mongoose model + its queries per file
│   ├── habits.ts
│   ├── completions.ts
│   └── users.ts              Phase 6
├── components/               Phase 4
│   ├── HabitForm.tsx         create and edit
│   ├── HabitList.tsx         main screen: titles + today checkbox
│   ├── HabitCard.tsx         title, description, last week, "Modificar"
│   ├── MonthCalendar.tsx
│   └── LoginForm.tsx         Phase 6
└── app/
    ├── layout.tsx, globals.css   autumn theme as CSS variables
    ├── page.tsx                  Principal: calendar + list + "Crear hábito"
    ├── actions.ts                server actions
    ├── habits/page.tsx           extended list (cards)
    ├── habits/new/page.tsx       create habit
    ├── habits/[id]/edit/page.tsx edit habit
    ├── login/page.tsx            Phase 6
    └── profile/page.tsx          Phase 6
```

### Data model

- `Habit`: `userId`, `title`, `description`, `schedule`, `archivedAt?`. The schedule is stored inside the habit:
  ```ts
  type Schedule = { kind: "weekdays"; days: number[] }   // 0 = Sunday … 6 = Saturday
                | { kind: "perWeek"; times: number };    // e.g. 3 times, any days
  ```
- `Completion`: `{ habitId, day: "YYYY-MM-DD" }`, unique on `{ habitId, day }`.
- `User` (Phase 6): `firstName`, `paternalSurname`, `maternalSurname`, `email` (unique), `passwordHash`, `birthDate`, `timeZone`.

A day is always a `"YYYY-MM-DD"` key in the user's time zone, never a raw `Date`: 21:00 in Mexico City is already the next day in UTC.

## TDD roadmap

Red → green → refactor. Write one failing test, make it pass with the simplest code, clean up, and repeat. Work from the inside out.

### Phase 1: Domain (`src/domain/`, unit tests)
Done so far: steps 1–4, in `dates.ts` and `schedule.ts`. Day helpers take and return `"YYYY-MM-DD"` strings and reject anything that is not a real date; `toDayKey(instant, timeZone)` is the only function that takes a `Date`.

1. `toDayKey(instant, timeZone)`: 21:00 on 5 Nov in `America/Mexico_City` is `"2026-11-05"`, not the UTC day.
2. `addDays(day, n)` across month and year boundaries; `weekday(day)` (0 = Sunday); `weekStart(day)` returns the Monday.
3. `isDue(schedule, day)`: weekdays habits are due only on their days; perWeek habits are due any day.
4. `validateSchedule`: rejects no days, a day outside 0–6, and `times` outside 1–7.
5. `currentStreak(completions, schedule, today)` for weekdays: none = 0; counts only due days; a non-due day doesn't break it; a missed due day does; today not done yet doesn't break it; duplicate completions count once.
6. `currentStreak` for perWeek: counts weeks that met the goal; the current, unfinished week doesn't break it.
7. `longestStreak(completions, schedule)`.
8. `lastWeek(completions, today)`: 7 entries `{ day, done }`, oldest first, for the card.
9. `monthSummary(habits, completions, month)`: for each day, how many habits were due and how many were done, for the calendar.

### Phase 2: Data (`src/repositories/`, in-memory Mongo)
10. `createHabit`, `updateHabit`, `getHabit`, `listHabits(userId)`, with validation (title required, schedule passes `validateSchedule`).
11. `toggleCompletion(habitId, day)`: the first call adds a completion, the second removes it.
12. Unique index on `{ habitId, day }`: two simultaneous toggles never create duplicates.
13. `listCompletions(habitIds, from, to)`.
14. `archiveHabit`: archived habits leave the list but keep their history.

### Phase 3: Server actions (`src/app/actions.ts`)
15. Actions call the repositories with a fixed `userId` and time zone and return validation errors as data, not thrown exceptions.

### Phase 4: UI (React Testing Library, then pages)
16. `HabitForm`: required-title error; weekday or "N per week" picker; calls `onSubmit` with the right values; pre-filled when editing.
17. `HabitList`: shows titles; the today checkbox calls toggle.
18. `HabitCard`: title, description, 7 last-week marks, a "Modificar" link to `/habits/[id]/edit`.
19. `MonthCalendar`: one cell per day, each with an `aria-label` like "5 Nov: 2 of 3 done".
20. Pages: server components call `connectDb()` and the repositories directly. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` before writing `[id]`.
21. Autumn theme in `src/app/globals.css` as CSS variables.

### Phase 5: End-to-end (Playwright + Docker Mongo)
22. Create a Mon/Wed/Fri habit, check it off today, and see it on the calendar and the card.
23. Edit a habit and see the change.
24. Archive a habit and see it disappear.

### Phase 6: Users and auth
25. `users.ts`: unique email; password hashed with `node:crypto` `scrypt`, never stored in plain text.
26. Login and session, following `node_modules/next/dist/docs/01-app/02-guides/authentication.md`.
27. Profile page.
28. Replace the fixed `userId` and time zone with the logged-in user's.

Out of scope until the core works: reminders.
