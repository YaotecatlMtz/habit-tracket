import mongoose, { Schema } from "mongoose";
import { validateSchedule, type Schedule } from "../domain/schedule";

export type Habit = {
  id: string;
  userId: string;
  title: string;
  description: string;
  schedule: Schedule;
  createdAt: Date;
  archivedAt?: Date;
};

const habitSchema = new Schema(
  {
    userId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    schedule: { type: Schema.Types.Mixed, required: true },
    archivedAt: Date,
  },
  { versionKey: false, timestamps: { updatedAt: false } },
);

const HabitModel =
  mongoose.models.Habit ?? mongoose.model("Habit", habitSchema);

const MAX_TITLE = 256;
const MAX_DESCRIPTION = 1000;
const MAX_PAGE_SIZE = 50;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

function normalize(value: unknown, name: string, spaces = /\s+/g) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value.trim().replace(spaces, " ");
}

function requireUserId(value: unknown) {
  const userId = normalize(value, "userId");
  if (!userId) throw new Error("userId is required");
  return userId;
}

function requireHabitId(id: unknown) {
  if (typeof id !== "string" || !OBJECT_ID.test(id))
    throw new Error(`Invalid habit id: ${JSON.stringify(id)}`);
  return id.toLowerCase();
}

function cleanTitle(value: unknown) {
  const title = normalize(value, "Title");
  if (!title) throw new Error("Title is required");
  if ([...title].length > MAX_TITLE)
    throw new Error(`Title is longer than ${MAX_TITLE} characters`);
  return title;
}

function cleanDescription(value: unknown) {
  const description = normalize(value, "Description", /[^\S\r\n]+/g);
  if ([...description].length > MAX_DESCRIPTION)
    throw new Error(`Description is longer than ${MAX_DESCRIPTION} characters`);
  return description;
}

function cleanSchedule(value: unknown): Schedule {
  const s = (value ?? {}) as Schedule;
  validateSchedule(s);
  return s.kind === "perWeek"
    ? { kind: s.kind, times: s.times }
    : { kind: s.kind, days: [...new Set(s.days)].sort((a, b) => a - b) };
}

function toHabit({ _id, ...rest }: Record<string, unknown>) {
  return { id: String(_id), description: "", ...rest } as Habit;
}

export async function createHabit(input: {
  userId: string;
  title: string;
  description?: string;
  schedule: Schedule;
}): Promise<Habit> {
  return toHabit(
    (
      await HabitModel.create({
        userId: requireUserId(input.userId),
        title: cleanTitle(input.title),
        description: cleanDescription(input.description ?? ""),
        schedule: cleanSchedule(input.schedule),
      })
    ).toObject(),
  );
}

export async function getHabit(
  userId: string,
  id: string,
): Promise<Habit | null> {
  const habitId = requireHabitId(id);
  // Filter by owner so one user can never read another user's habit by id.
  const habit = await HabitModel.findOne({
    _id: habitId,
    userId: requireUserId(userId),
  }).lean();
  return habit && toHabit(habit);
}

export async function updateHabit(
  userId: string,
  id: string,
  patch: { title?: string; description?: string; schedule?: Schedule },
): Promise<Habit | null> {
  const habitId = requireHabitId(id);
  const owner = requireUserId(userId);
  // Build $set from known fields only, so userId, createdAt and archivedAt can't be changed.
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = cleanTitle(patch.title);
  if (patch.description !== undefined)
    set.description = cleanDescription(patch.description);
  if (patch.schedule !== undefined)
    set.schedule = cleanSchedule(patch.schedule);
  if (!Object.keys(set).length) return getHabit(owner, id);

  const habit = await HabitModel.findOneAndUpdate(
    { _id: habitId, userId: owner },
    { $set: set },
    { returnDocument: "after" },
  ).lean();
  return habit && toHabit(habit);
}

export async function listHabits(
  userId: string,
  { after, limit = MAX_PAGE_SIZE }: { after?: string; limit?: number } = {},
): Promise<{ habits: Habit[]; nextCursor: string | null }> {
  const owner = requireUserId(userId);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE)
    throw new Error(`limit must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  // Cursor = id of the last habit seen. ObjectIds grow with creation time, so sorting by _id is oldest first.
  const rows = await HabitModel.find({
    userId: owner,
    archivedAt: null, // also matches habits where the field is missing
    ...(after !== undefined && { _id: { $gt: requireHabitId(after) } }),
  })
    .sort({ _id: 1 })
    .limit(limit + 1) // one extra row tells us whether another page exists
    .lean();
  const habits = rows.slice(0, limit).map(toHabit);
  return {
    habits,
    nextCursor: rows.length > limit ? habits[limit - 1].id : null,
  };
}
