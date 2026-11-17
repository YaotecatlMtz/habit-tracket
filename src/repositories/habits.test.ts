import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { connectDb } from "../lib/db";
import type { Schedule } from "../domain/schedule";
import { createHabit, getHabit, updateHabit, type Habit } from "./habits";

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

  it("accepts a description of 1000 characters, rejects 1001", async () => {
    await expect(
      createHabit({ ...valid, description: "a".repeat(1000) }),
    ).resolves.toBeDefined();
    await expect(
      createHabit({ ...valid, description: "a".repeat(1001) }),
    ).rejects.toThrow(/1000/);
  });

  it("stores only the known schedule keys", async () => {
    const habit = await createHabit({
      ...valid,
      schedule: { ...mwf, times: 3, junk: "x" } as never,
    });
    expect(habit.schedule).toEqual(mwf);
    expect((await getHabit("u1", habit.id))?.schedule).toEqual(mwf);
  });

  it("keeps line breaks in the description", async () => {
    expect(
      (await createHabit({ ...valid, description: "1. Read\n2.  Sum up" }))
        .description,
    ).toBe("1. Read\n2. Sum up");
  });

  it("counts an emoji as one character", async () => {
    await expect(
      createHabit({ ...valid, title: `${"a".repeat(255)}🧘` }),
    ).resolves.toBeDefined();
  });

  it("stores weekdays without duplicates, in order", async () => {
    const habit = await createHabit({
      ...valid,
      schedule: { kind: "weekdays", days: [5, 1, 1] },
    });
    expect(habit.schedule).toEqual({ kind: "weekdays", days: [1, 5] });
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
    expect(await getHabit("u1", created.id)).toEqual(created);
  });

  it("returns all fields, with a string id equal to the one asked for", async () => {
    const created = await createHabit({ ...valid, description: "20 pages" });
    const habit = await getHabit("u1", created.id);
    expect(habit).toEqual({
      id: created.id,
      userId: "u1",
      title: "Read",
      description: "20 pages",
      schedule: mwf,
      createdAt: created.createdAt,
    });
    expect(typeof habit?.id).toBe("string");
    expect(habit?.createdAt).toBeInstanceOf(Date);
  });

  it("works for a perWeek schedule", async () => {
    const schedule: Schedule = { kind: "perWeek", times: 3 };
    const created = await createHabit({ ...valid, schedule });
    expect((await getHabit("u1", created.id))?.schedule).toEqual(schedule);
  });

  it("returns exactly the habit asked for when there are several", async () => {
    await createHabit({ ...valid, title: "First" });
    const second = await createHabit({ ...valid, title: "Second" });
    await createHabit({ ...valid, title: "Third" });
    expect((await getHabit("u1", second.id))?.title).toBe("Second");
  });

  it("returns an archived habit, with archivedAt as a Date", async () => {
    const archivedAt = new Date("2026-11-05T10:00:00Z");
    const id = await insertRaw({ archivedAt });
    expect((await getHabit("u1", id))?.archivedAt).toEqual(archivedAt);
  });

  it("leaves archivedAt out when the habit is not archived", async () => {
    const created = await createHabit(valid);
    expect(await getHabit("u1", created.id)).not.toHaveProperty("archivedAt");
  });
});

describe("getHabit, rainy day scenarios", () => {
  const unknownId = () => new mongoose.Types.ObjectId().toString();

  it("returns null for a well-formed id that does not exist", async () => {
    await createHabit(valid);
    await expect(getHabit("u1", unknownId())).resolves.toBeNull();
  });

  it("returns null for a habit that was removed", async () => {
    const id = await insertRaw({});
    await mongoose.connection
      .collection("habits")
      .deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    await expect(getHabit("u1", id)).resolves.toBeNull();
  });

  it.each(["abc", "", "123", "not-an-id", "z".repeat(24)])(
    "throws for the malformed id %j, not null",
    async (id) => {
      await expect(getHabit("u1", id)).rejects.toThrow(/invalid habit id/i);
    },
  );

  it.each([undefined, null, 123, {}])(
    "throws for the non-string id %j",
    async (id) => {
      await expect(getHabit("u1", id as never)).rejects.toThrow(
        /invalid habit id/i,
      );
    },
  );

  it("does not change the database when the lookup fails", async () => {
    await createHabit(valid);
    await getHabit("u1", unknownId());
    await expect(getHabit("u1", "abc")).rejects.toThrow();
    expect(await count()).toBe(1);
  });
});

describe("getHabit, ownership", () => {
  it("returns null for a habit of another user", async () => {
    const created = await createHabit(valid);
    await expect(getHabit("u2", created.id)).resolves.toBeNull();
  });

  it.each([undefined, "", "   ", { $ne: null }])(
    "throws for userId %j",
    async (userId) => {
      const created = await createHabit(valid);
      await expect(getHabit(userId as never, created.id)).rejects.toThrow(
        /user/i,
      );
    },
  );
});

describe("getHabit, edge cases", () => {
  it("throws for a 12-character string, which Mongoose would accept as an id", async () => {
    await expect(getHabit("u1", "abcdefghijkl")).rejects.toThrow(
      /invalid habit id/i,
    );
  });

  it("throws for an id with surrounding spaces", async () => {
    const created = await createHabit(valid);
    await expect(getHabit("u1", ` ${created.id} `)).rejects.toThrow(
      /invalid habit id/i,
    );
  });

  it("accepts the id in uppercase", async () => {
    const created = await createHabit(valid);
    expect((await getHabit("u1", created.id.toUpperCase()))?.id).toBe(
      created.id,
    );
  });

  it("returns a plain object, not a Mongoose document", async () => {
    const created = await createHabit(valid);
    const habit = await getHabit("u1", created.id);
    expect(Object.getPrototypeOf(habit)).toBe(Object.prototype);
    expect(habit).not.toHaveProperty("save");
    expect(Object.getPrototypeOf(habit?.schedule)).toBe(Object.prototype);
  });

  it("returns id only, with no _id or __v", async () => {
    const created = await createHabit(valid);
    const habit = await getHabit("u1", created.id);
    expect(habit).not.toHaveProperty("_id");
    expect(habit).not.toHaveProperty("__v");
  });

  it("returns equal results when read twice", async () => {
    const created = await createHabit(valid);
    expect(await getHabit("u1", created.id)).toEqual(
      await getHabit("u1", created.id),
    );
  });

  it("does not share references between reads", async () => {
    const created = await createHabit(valid);
    const first = (await getHabit("u1", created.id)) as Habit;
    first.title = "Changed";
    (first.schedule as { days: number[] }).days.push(0);
    expect(await getHabit("u1", created.id)).toEqual(created);
  });

  it("returns description '' for a habit stored without one", async () => {
    const id = await insertRaw({ description: undefined });
    expect((await getHabit("u1", id))?.description).toBe("");
  });
});

describe("updateHabit, main scenarios", () => {
  const make = (extra = {}) =>
    createHabit({ ...valid, description: "20 pages", ...extra });

  it("changes only the title and keeps the other fields", async () => {
    const created = await make();
    const updated = await updateHabit("u1", created.id, { title: "Write" });
    expect(updated).toEqual({ ...created, title: "Write" });
  });

  it("changes only the description", async () => {
    const created = await make();
    const updated = await updateHabit("u1", created.id, { description: "10" });
    expect(updated).toEqual({ ...created, description: "10" });
  });

  it("changes only the schedule", async () => {
    const created = await make();
    const schedule: Schedule = { kind: "perWeek", times: 2 };
    const updated = await updateHabit("u1", created.id, { schedule });
    expect(updated).toEqual({ ...created, schedule });
  });

  it("changes several fields at once", async () => {
    const created = await make();
    const patch = {
      title: "Run",
      description: "5 km",
      schedule: { kind: "perWeek", times: 4 },
    } as const;
    expect(await updateHabit("u1", created.id, patch)).toEqual({
      ...created,
      ...patch,
    });
  });

  it("saves the change: getHabit returns what updateHabit returned", async () => {
    const created = await make();
    const updated = await updateHabit("u1", created.id, { title: "Write" });
    expect(await getHabit("u1", created.id)).toEqual(updated);
  });

  it("keeps id, userId and createdAt", async () => {
    const created = await make();
    const updated = await updateHabit("u1", created.id, { title: "Write" });
    expect(updated).toMatchObject({
      id: created.id,
      userId: "u1",
      createdAt: created.createdAt,
    });
  });

  it("returns the habit unchanged for an empty patch", async () => {
    const created = await make();
    expect(await updateHabit("u1", created.id, {})).toEqual(created);
  });

  it("does not touch other habits", async () => {
    const other = await make({ title: "Other" });
    const target = await make();
    await updateHabit("u1", target.id, { title: "Write" });
    expect(await getHabit("u1", other.id)).toEqual(other);
  });
});

describe("updateHabit, title rules", () => {
  const upd = async (title: unknown) => {
    const { id } = await createHabit(valid);
    return updateHabit("u1", id, { title: title as string });
  };

  it("trims and collapses spaces", async () => {
    expect((await upd("  Read   a\t\n book "))?.title).toBe("Read a book");
  });

  it("keeps accents and emoji", async () => {
    expect((await upd("Meditación 🧘"))?.title).toBe("Meditación 🧘");
  });

  it("accepts 256 characters, rejects 257", async () => {
    await expect(upd("a".repeat(256))).resolves.toBeDefined();
    await expect(upd("a".repeat(257))).rejects.toThrow(/256/);
  });

  it("counts emoji as one character", async () => {
    await expect(upd("🧘".repeat(256))).resolves.toBeDefined();
    await expect(upd("🧘".repeat(257))).rejects.toThrow(/256/);
  });

  it("measures the length after normalizing", async () => {
    await expect(upd(`  ${"a".repeat(256)}  `)).resolves.toBeDefined();
  });

  it.each(["", "   ", 123, null, {}])(
    "rejects title %j and changes nothing",
    async (title) => {
      const created = await createHabit(valid);
      await expect(
        updateHabit("u1", created.id, { title: title as never }),
      ).rejects.toThrow(/title/i);
      expect(await getHabit("u1", created.id)).toEqual(created);
    },
  );

  it("treats title undefined as not provided", async () => {
    const created = await createHabit(valid);
    const updated = await updateHabit("u1", created.id, {
      title: undefined,
      description: "x",
    });
    expect(updated?.title).toBe("Read");
  });
});

describe("updateHabit, description rules", () => {
  const upd = async (description: unknown, extra = {}) => {
    const { id } = await createHabit({ ...valid, ...extra });
    return updateHabit("u1", id, { description: description as string });
  };

  it("collapses spaces but keeps line breaks", async () => {
    expect((await upd("  a   b\n\nc  "))?.description).toBe("a b\n\nc");
  });

  it("accepts 1000 characters, rejects 1001", async () => {
    await expect(upd("a".repeat(1000))).resolves.toBeDefined();
    await expect(upd("a".repeat(1001))).rejects.toThrow(/1000/);
  });

  it("counts emoji as one character", async () => {
    await expect(upd("🧘".repeat(1000))).resolves.toBeDefined();
    await expect(upd("🧘".repeat(1001))).rejects.toThrow(/1000/);
  });

  it.each(["", "   "])("clears the description with %j", async (value) => {
    expect((await upd(value, { description: "old" }))?.description).toBe("");
  });

  it.each([123, null, {}])(
    "rejects description %j and changes nothing",
    async (description) => {
      const created = await createHabit({ ...valid, description: "old" });
      await expect(
        updateHabit("u1", created.id, { description: description as never }),
      ).rejects.toThrow(/description/i);
      expect(await getHabit("u1", created.id)).toEqual(created);
    },
  );
});

describe("updateHabit, schedule rules", () => {
  it.each([
    { kind: "weekdays", days: [] },
    { kind: "weekdays", days: [7] },
    { kind: "perWeek", times: 0 },
    { kind: "perWeek", times: 8 },
    { kind: "perWeek", times: 2.5 },
    { kind: "nope" },
    null,
  ])("rejects schedule %j and changes nothing", async (schedule) => {
    const created = await createHabit(valid);
    await expect(
      updateHabit("u1", created.id, { schedule: schedule as never }),
    ).rejects.toThrow();
    expect(await getHabit("u1", created.id)).toEqual(created);
  });

  it("drops extra keys", async () => {
    const created = await createHabit(valid);
    const updated = await updateHabit("u1", created.id, {
      schedule: { kind: "perWeek", times: 3, days: [1], junk: "x" } as never,
    });
    expect(updated?.schedule).toEqual({ kind: "perWeek", times: 3 });
  });

  it("removes duplicate days and sorts them", async () => {
    const created = await createHabit(valid);
    const updated = await updateHabit("u1", created.id, {
      schedule: { kind: "weekdays", days: [5, 1, 5, 3, 1] },
    });
    expect(updated?.schedule).toEqual(mwf);
  });

  it("leaves no keys of the old kind when switching, both ways", async () => {
    const created = await createHabit(valid);
    const perWeek: Schedule = { kind: "perWeek", times: 2 };
    await updateHabit("u1", created.id, { schedule: perWeek });
    expect((await getHabit("u1", created.id))?.schedule).toStrictEqual(perWeek);
    await updateHabit("u1", created.id, { schedule: mwf });
    expect((await getHabit("u1", created.id))?.schedule).toStrictEqual(mwf);
  });

  it("accepts the schedule limits", async () => {
    const created = await createHabit(valid);
    for (const schedule of [
      { kind: "perWeek", times: 1 },
      { kind: "perWeek", times: 7 },
      { kind: "weekdays", days: [0, 6] },
    ] as Schedule[]) {
      await expect(
        updateHabit("u1", created.id, { schedule }),
      ).resolves.toBeDefined();
    }
  });
});

describe("updateHabit, rainy day scenarios", () => {
  const unknownId = () => new mongoose.Types.ObjectId().toString();

  it("returns null for a well-formed id that does not exist", async () => {
    await expect(
      updateHabit("u1", unknownId(), { title: "x" }),
    ).resolves.toBeNull();
  });

  it("returns null for another user's habit and changes nothing", async () => {
    const created = await createHabit(valid);
    await expect(
      updateHabit("u2", created.id, { title: "Hacked" }),
    ).resolves.toBeNull();
    expect(await getHabit("u1", created.id)).toEqual(created);
  });

  it.each([
    "abc",
    "",
    "123",
    "z".repeat(24),
    "abcdefghijkl",
    " 0123456789abcdef01234567 ",
  ])("throws for the malformed id %j", async (id) => {
    await expect(updateHabit("u1", id, { title: "x" })).rejects.toThrow(
      /invalid habit id/i,
    );
  });

  it.each([undefined, null, 123, {}])(
    "throws for the non-string id %j",
    async (id) => {
      await expect(
        updateHabit("u1", id as never, { title: "x" }),
      ).rejects.toThrow(/invalid habit id/i);
    },
  );

  it.each([undefined, "", "   ", 123])("rejects userId %j", async (userId) => {
    const created = await createHabit(valid);
    await expect(
      updateHabit(userId as never, created.id, { title: "x" }),
    ).rejects.toThrow(/user/i);
    expect(await getHabit("u1", created.id)).toEqual(created);
  });

  it("changes nothing when one field of the patch is invalid", async () => {
    const created = await createHabit(valid);
    await expect(
      updateHabit("u1", created.id, {
        title: "Valid",
        description: "a".repeat(1001),
      }),
    ).rejects.toThrow();
    expect(await getHabit("u1", created.id)).toEqual(created);
  });
});

describe("updateHabit, edge cases", () => {
  it("ignores userId, _id, createdAt and archivedAt in the patch", async () => {
    const created = await createHabit(valid);
    const updated = await updateHabit("u1", created.id, {
      title: "Write",
      userId: "u2",
      _id: "x",
      createdAt: new Date(0),
      archivedAt: new Date(),
    } as never);
    expect(updated).toEqual({ ...created, title: "Write" });
    expect(await getHabit("u1", created.id)).toEqual(updated);
    expect(await getHabit("u2", created.id)).toBeNull();
  });

  it("accepts the id in uppercase", async () => {
    const created = await createHabit(valid);
    const updated = await updateHabit("u1", created.id.toUpperCase(), {
      title: "Write",
    });
    expect(updated?.id).toBe(created.id);
  });

  it("does not change its input", async () => {
    const created = await createHabit(valid);
    const patch = {
      title: "  Read   a  book ",
      schedule: { kind: "weekdays", days: [3, 1, 1] } as Schedule,
    };
    const copy = structuredClone(patch);
    await updateHabit("u1", created.id, patch);
    expect(patch).toEqual(copy);
  });

  it("returns a plain object with createdAt as a Date", async () => {
    const created = await createHabit(valid);
    const updated = await updateHabit("u1", created.id, { title: "Write" });
    expect(Object.getPrototypeOf(updated)).toBe(Object.prototype);
    expect(updated).not.toHaveProperty("save");
    expect(updated?.createdAt).toBeInstanceOf(Date);
  });

  it("keeps both changes when two updates touch different fields at once", async () => {
    const created = await createHabit(valid);
    await Promise.all([
      updateHabit("u1", created.id, { title: "Write" }),
      updateHabit("u1", created.id, { description: "10 min" }),
    ]);
    expect(await getHabit("u1", created.id)).toMatchObject({
      title: "Write",
      description: "10 min",
    });
  });

  it("lets the last write win when two updates touch the same field", async () => {
    const created = await createHabit(valid);
    await Promise.all([
      updateHabit("u1", created.id, { title: "A" }),
      updateHabit("u1", created.id, { title: "B" }),
    ]);
    expect(["A", "B"]).toContain((await getHabit("u1", created.id))?.title);
  });

  it("updates an archived habit and keeps archivedAt", async () => {
    const archivedAt = new Date("2026-11-05T10:00:00Z");
    const id = await insertRaw({ archivedAt });
    const updated = await updateHabit("u1", id, { title: "Write" });
    expect(updated).toMatchObject({ title: "Write", archivedAt });
  });
});
