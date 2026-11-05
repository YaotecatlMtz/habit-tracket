# Habit Tracker

A TDD practice project with Next.js, React, TypeScript and MongoDB (via Mongoose). You create habits, check them off each day, and see your streaks and a calendar heatmap.

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
| Domain logic (pure functions) | `src/**/*.test.ts` | Node | none yet |
| Repositories (Mongo) | `src/**/*.test.ts` | Node + in-memory Mongo | `src/lib/db.test.ts` |
| Components | `src/**/*.test.tsx` | jsdom + React Testing Library | none yet |
| End-to-end | `e2e/*.spec.ts` | Real browser | none yet |

`.ts` vs `.tsx` decides the environment (see `vitest.config.mts`).
Mongoose models use one shared connection. The app calls `await connectDb()` from `src/lib/db.ts` before querying; tests point `MONGODB_URI` at the in-memory server first (see `src/lib/db.test.ts`).
Define models as `mongoose.models.Habit ?? mongoose.model("Habit", schema)`, or Next.js hot reload throws "Cannot overwrite model once compiled".

`src/app` doesn't exist yet, so `npm run dev` and `npm run e2e` fail until you create `src/app/layout.tsx` and `src/app/page.tsx` (Phase 4).

## TDD roadmap

Red → green → refactor. Write one failing test, make it pass with the simplest code, clean up, and repeat. Work from the inside out.

### Phase 1: Domain (`src/domain/`, unit tests)
1. `currentStreak(completions, today)`: none = 0; only today = 1; consecutive days; a gap breaks it; today not done yet doesn't break it.
2. `longestStreak(completions)`.
3. Duplicate completions on the same day count once.
4. Time zones: a completion counts toward the day in the user's time zone, not UTC (23:30 in Madrid is still "today").
5. Weekly habits ("3 times per week"): the streak counts weeks that met the goal.
6. `completionRate(completions, from, to)`.
7. `heatmap(completions, from, to)`: a map from day to count, for the calendar.

### Phase 2: Data (`src/repositories/`, in-memory Mongo)
8. `createHabit`, `listHabits(userId)`, with validation (name required, goal > 0).
9. `toggleCompletion(habitId, day)`: the first call adds a completion, the second removes it.
10. Unique index on `{ habitId, day }`: two simultaneous toggles never create duplicates.
11. `archiveHabit`: archived habits leave the list but keep their history.

### Phase 3: Server actions (`src/app/actions.ts`)
12. Actions call the repositories and return validation errors as data, not thrown exceptions.

### Phase 4: UI (React Testing Library)
13. `HabitForm`: required-name error; calls `onSubmit` with the right values.
14. `HabitItem`: shows the streak; the checkbox calls toggle.
15. `Heatmap`: renders N cells, each with an `aria-label` like "3 Nov: 1 completion".

### Phase 5: End-to-end (Playwright + Docker Mongo)
16. Create a habit, check it off, and see the streak become 1.
17. Archive a habit and see it disappear.

Out of scope until the core works: authentication (use a fixed `userId`), reminders, styling.
