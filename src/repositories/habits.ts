import mongoose, { Schema } from "mongoose";
import { validateSchedule, type Schedule } from "../domain/schedule";

export type Habit = {
  id: string;
  userId: string;
  title: string;
  description: string;
  schedule: Schedule;
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
  { versionKey: false },
);

const HabitModel =
  mongoose.models.Habit ?? mongoose.model("Habit", habitSchema);

const MAX_TITLE = 256;

function normalize(value: unknown, name: string) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value.trim().replace(/\s+/g, " ");
}

export async function createHabit(input: {
  userId: string;
  title: string;
  description?: string;
  schedule: Schedule;
}): Promise<Habit> {
  const userId = normalize(input.userId, "userId");
  if (!userId) throw new Error("userId is required");
  const title = normalize(input.title, "Title");
  if (!title) throw new Error("Title is required");
  if (title.length > MAX_TITLE)
    throw new Error(`Title is longer than ${MAX_TITLE} characters`);
  const description = normalize(input.description ?? "", "Description");
  validateSchedule(input.schedule ?? ({} as Schedule));

  return toHabit(
    (
      await HabitModel.create({
        userId,
        title,
        description,
        schedule: input.schedule,
      })
    ).toObject(),
  );
}

function toHabit({ _id, ...rest }: Record<string, unknown>) {
  return { id: String(_id), description: "", ...rest } as Habit;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export async function getHabit(id: string): Promise<Habit | null> {
  if (typeof id !== "string" || !OBJECT_ID.test(id))
    throw new Error(`Invalid habit id: ${JSON.stringify(id)}`);
  // Lowercase explicitly so we never depend on how the driver casts ids.
  const habit = await HabitModel.findById(id.toLowerCase()).lean();
  return habit && toHabit(habit);
}
