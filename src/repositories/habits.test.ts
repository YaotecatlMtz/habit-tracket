import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { connectDb } from "../lib/db";
import type { Schedule } from "../domain/schedule";
import { createHabit, getHabit, type Habit } from "./habits";

let server: MongoMemoryServer;

const count = () => mongoose.connection.collection("habits").countDocuments();

const mwf: Schedule = { kind: "weekdays", days: [1, 3, 5] };
const valid = { userId: "u1", title: "Read", schedule: mwf };

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("habits-test");
  await connectDb();
}, 120_000);
afterEach(() => mongoose.connection.collection("habits").deleteMany({}));
afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

describe("createHabit, main scenarios", () => {
  it("creates a weekdays habit and returns it with a string id", async () => {
    const habit = await createHabit(valid);
    expect(typeof habit.id).toBe("string");
    expect(habit).toMatchObject({ userId: "u1", title: "Read", schedule: mwf });
    expect(await count()).toBe(1);
  });

  it("creates a perWeek habit", async () => {
    const schedule: Schedule = { kind: "perWeek", times: 3 };
    expect((await createHabit({ ...valid, schedule })).schedule).toEqual(
      schedule,
    );
  });

  it("defaults description to '' and leaves archivedAt unset", async () => {
    const habit = await createHabit(valid);
    expect(habit.description).toBe("");
    expect(habit.archivedAt).toBeUndefined();
  });

  it("trims the title and collapses spaces between words", async () => {
    expect(
      (await createHabit({ ...valid, title: "  Read   a  book " })).title,
    ).toBe("Read a book");
    expect(
      (await createHabit({ ...valid, title: "Read\t\n  a book" })).title,
    ).toBe("Read a book");
  });

  it("normalizes the description the same way", async () => {
    expect(
      (await createHabit({ ...valid, description: "  20   pages  " }))
        .description,
    ).toBe("20 pages");
    expect(
      (await createHabit({ ...valid, description: "   " })).description,
    ).toBe("");
  });
});

describe("createHabit, rainy day scenarios", () => {
  it.each([undefined, "", "   ", 123, null, {}])(
    "rejects title %j",
    async (title) => {
      await expect(
        createHabit({ ...valid, title: title as never }),
      ).rejects.toThrow(/title/i);
      expect(await count()).toBe(0);
    },
  );

  it.each([
    { kind: "weekdays", days: [] },
    { kind: "weekdays", days: [7] },
    { kind: "perWeek", times: 0 },
    { kind: "perWeek", times: 8 },
    { kind: "perWeek", times: 2.5 },
    { kind: "nope" },
    undefined,
  ])("rejects schedule %j", async (schedule) => {
    await expect(
      createHabit({ ...valid, schedule: schedule as never }),
    ).rejects.toThrow();
    expect(await count()).toBe(0);
  });

  it.each([undefined, "", "   ", 123])("rejects userId %j", async (userId) => {
    await expect(
      createHabit({ ...valid, userId: userId as never }),
    ).rejects.toThrow(/user/i);
    expect(await count()).toBe(0);
  });
});

describe("createHabit, edge cases", () => {
  it("keeps accents and emoji", async () => {
    expect(
      (await createHabit({ ...valid, title: "Meditación 🧘" })).title,
    ).toBe("Meditación 🧘");
  });

  it("accepts titles of 1 and 256 characters, rejects 257", async () => {
    await expect(createHabit({ ...valid, title: "a" })).resolves.toBeDefined();
    await expect(
      createHabit({ ...valid, title: "a".repeat(256) }),
    ).resolves.toBeDefined();
    await expect(
      createHabit({ ...valid, title: "a".repeat(257) }),
    ).rejects.toThrow(/256/);
  });

  it("measures the length after normalizing", async () => {
    const padded = `  ${"a".repeat(256)}  `;
    await expect(
      createHabit({ ...valid, title: padded }),
    ).resolves.toBeDefined();
  });

  it("accepts the schedule limits", async () => {
    for (const schedule of [
      { kind: "perWeek", times: 1 },
      { kind: "perWeek", times: 7 },
      { kind: "weekdays", days: [0, 6] },
    ] as Schedule[]) {
      await expect(createHabit({ ...valid, schedule })).resolves.toBeDefined();
    }
  });

  it("allows duplicate titles", async () => {
    const a = await createHabit(valid);
    const b = await createHabit(valid);
    expect(a.id).not.toBe(b.id);
    expect(await count()).toBe(2);
  });

  it("handles concurrent creates", async () => {
    const habits = await Promise.all([createHabit(valid), createHabit(valid)]);
    expect(habits[0].id).not.toBe(habits[1].id);
  });

  it("ignores unknown fields such as archivedAt and _id", async () => {
    const habit = await createHabit({
      ...valid,
      archivedAt: new Date(),
      _id: "x",
    } as never);
    expect(habit.archivedAt).toBeUndefined();
    expect(habit.id).not.toBe("x");
  });

  it("does not change its input", async () => {
    const input = {
      ...valid,
      title: "  Read   a  book ",
      schedule: { kind: "weekdays", days: [1, 3] } as Schedule,
    };
    const copy = structuredClone(input);
    await createHabit(input);
    expect(input).toEqual(copy);
  });

  it("returns the schedule as plain data", async () => {
    const habit = await createHabit(valid);
    expect(habit.schedule).toEqual(mwf);
    expect(Object.getPrototypeOf(habit.schedule)).toBe(Object.prototype);
  });
});

// Inserts through the raw collection so these tests don't depend on other repository functions.
const insertRaw = async (doc: object) =>
  (
    await mongoose.connection.collection("habits").insertOne(
      // The driver stores undefined as null, so drop those keys to get a field that is truly absent.
      Object.fromEntries(
        Object.entries({
          userId: "u1",
          title: "Read",
          description: "",
          schedule: mwf,
          ...doc,
        }).filter(([, value]) => value !== undefined),
      ),
    )
  ).insertedId.toString();

describe("getHabit, main scenarios", () => {
  it("returns the habit that createHabit returned", async () => {
    const created = await createHabit(valid);
    expect(await getHabit(created.id)).toEqual(created);
  });

  it("returns all fields, with a string id equal to the one asked for", async () => {
    const created = await createHabit({ ...valid, description: "20 pages" });
    const habit = await getHabit(created.id);
    expect(habit).toEqual({
      id: created.id,
      userId: "u1",
      title: "Read",
      description: "20 pages",
      schedule: mwf,
    });
    expect(typeof habit?.id).toBe("string");
  });

  it("works for a perWeek schedule", async () => {
    const schedule: Schedule = { kind: "perWeek", times: 3 };
    const created = await createHabit({ ...valid, schedule });
    expect((await getHabit(created.id))?.schedule).toEqual(schedule);
  });

  it("returns exactly the habit asked for when there are several", async () => {
    await createHabit({ ...valid, title: "First" });
    const second = await createHabit({ ...valid, title: "Second" });
    await createHabit({ ...valid, title: "Third" });
    expect((await getHabit(second.id))?.title).toBe("Second");
  });

  it("returns an archived habit, with archivedAt as a Date", async () => {
    const archivedAt = new Date("2026-11-05T10:00:00Z");
    const id = await insertRaw({ archivedAt });
    expect((await getHabit(id))?.archivedAt).toEqual(archivedAt);
  });

  it("leaves archivedAt out when the habit is not archived", async () => {
    const created = await createHabit(valid);
    expect(await getHabit(created.id)).not.toHaveProperty("archivedAt");
  });
});

describe("getHabit, rainy day scenarios", () => {
  const unknownId = () => new mongoose.Types.ObjectId().toString();

  it("returns null for a well-formed id that does not exist", async () => {
    await createHabit(valid);
    await expect(getHabit(unknownId())).resolves.toBeNull();
  });

  it("returns null for a habit that was removed", async () => {
    const id = await insertRaw({});
    await mongoose.connection
      .collection("habits")
      .deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    await expect(getHabit(id)).resolves.toBeNull();
  });

  it.each(["abc", "", "123", "not-an-id", "z".repeat(24)])(
    "throws for the malformed id %j, not null",
    async (id) => {
      await expect(getHabit(id)).rejects.toThrow(/invalid habit id/i);
    },
  );

  it.each([undefined, null, 123, {}])(
    "throws for the non-string id %j",
    async (id) => {
      await expect(getHabit(id as never)).rejects.toThrow(/invalid habit id/i);
    },
  );

  it("does not change the database when the lookup fails", async () => {
    await createHabit(valid);
    await getHabit(unknownId());
    await expect(getHabit("abc")).rejects.toThrow();
    expect(await count()).toBe(1);
  });
});

describe("getHabit, edge cases", () => {
  it("throws for a 12-character string, which Mongoose would accept as an id", async () => {
    await expect(getHabit("abcdefghijkl")).rejects.toThrow(/invalid habit id/i);
  });

  it("throws for an id with surrounding spaces", async () => {
    const created = await createHabit(valid);
    await expect(getHabit(` ${created.id} `)).rejects.toThrow(
      /invalid habit id/i,
    );
  });

  it("accepts the id in uppercase", async () => {
    const created = await createHabit(valid);
    expect((await getHabit(created.id.toUpperCase()))?.id).toBe(created.id);
  });

  it("returns a plain object, not a Mongoose document", async () => {
    const created = await createHabit(valid);
    const habit = await getHabit(created.id);
    expect(Object.getPrototypeOf(habit)).toBe(Object.prototype);
    expect(habit).not.toHaveProperty("save");
    expect(Object.getPrototypeOf(habit?.schedule)).toBe(Object.prototype);
  });

  it("returns id only, with no _id or __v", async () => {
    const created = await createHabit(valid);
    const habit = await getHabit(created.id);
    expect(habit).not.toHaveProperty("_id");
    expect(habit).not.toHaveProperty("__v");
  });

  it("returns equal results when read twice", async () => {
    const created = await createHabit(valid);
    expect(await getHabit(created.id)).toEqual(await getHabit(created.id));
  });

  it("does not share references between reads", async () => {
    const created = await createHabit(valid);
    const first = (await getHabit(created.id)) as Habit;
    first.title = "Changed";
    (first.schedule as { days: number[] }).days.push(0);
    expect(await getHabit(created.id)).toEqual(created);
  });

  it("returns description '' for a habit stored without one", async () => {
    const id = await insertRaw({ description: undefined });
    expect((await getHabit(id))?.description).toBe("");
  });
});
