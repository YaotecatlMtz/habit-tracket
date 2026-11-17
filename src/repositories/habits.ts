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

function normalize(value: unknown, name: string, spaces = /\s+/g) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value.trim().replace(spaces, " ");
}

function requireUserId(value: unknown) {
  const userId = normalize(value, "userId");
  if (!userId) throw new Error("userId is required");
  return userId;
}

export async function createHabit(input: {
  userId: string;
  title: string;
  description?: string;
  schedule: Schedule;
}): Promise<Habit> {
  const userId = requireUserId(input.userId);
  const title = normalize(input.title, "Title");
  if (!title) throw new Error("Title is required");
  // Count code points, not UTF-16 units, so an emoji counts as one character.
  if ([...title].length > MAX_TITLE)
    throw new Error(`Title is longer than ${MAX_TITLE} characters`);
  // Collapse spaces but keep the line breaks the user typed.
  const description = normalize(
    input.description ?? "",
    "Description",
    /[^\S\r\n]+/g,
  );
  if ([...description].length > MAX_DESCRIPTION)
    throw new Error(`Description is longer than ${MAX_DESCRIPTION} characters`);
  const s = input.schedule ?? ({} as Schedule);
  validateSchedule(s);
  const schedule: Schedule =
    s.kind === "perWeek"
      ? { kind: s.kind, times: s.times }
      : { kind: s.kind, days: [...new Set(s.days)].sort((a, b) => a - b) };

  return toHabit(
    (
      await HabitModel.create({
        userId,
        title,
        description,
        schedule,
      })
    ).toObject(),
  );
}

function toHabit({ _id, ...rest }: Record<string, unknown>) {
  return { id: String(_id), description: "", ...rest } as Habit;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function getHabit(
  userId: string,
  id: string,
): Promise<Habit | null> {
  if (typeof id !== "string" || !OBJECT_ID.test(id))
    throw new Error(`Invalid habit id: ${JSON.stringify(id)}`);
  // Filter by owner so one user can never read another user's habit by id.
  const habit = await HabitModel.findOne({
    // Lowercase explicitly so we never depend on how the driver casts ids.
    _id: id.toLowerCase(),
    userId: requireUserId(userId),
  }).lean();
  return habit && toHabit(habit);
}
