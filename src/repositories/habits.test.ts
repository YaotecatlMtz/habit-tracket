import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { connectDb } from "../lib/db";
import type { Schedule } from "../domain/schedule";
import {
  createHabit,
  getHabit,
  listHabits,
  updateHabit,
  type Habit,
} from "./habits";

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
  it("creates a weekdays habit and returns it in full, with no archivedAt", async () => {
    const habit = await createHabit(valid);
    expect(habit).toStrictEqual({
      id: expect.any(String),
      userId: "u1",
      title: "Read",
      description: "",
      schedule: mwf,
      createdAt: expect.any(Date),
    });
    expect(await count()).toBe(1);
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
  it.each([undefined, "   ", 123])("rejects title %j", async (title) => {
    await expect(
      createHabit({ ...valid, title: title as never }),
    ).rejects.toThrow(/title/i);
    expect(await count()).toBe(0);
  });

  it.each([undefined, { kind: "nope" }])(
    "rejects schedule %j",
    async (schedule) => {
      await expect(
        createHabit({ ...valid, schedule: schedule as never }),
      ).rejects.toThrow();
      expect(await count()).toBe(0);
    },
  );

  it.each(["   ", 123])("rejects userId %j", async (userId) => {
    await expect(
      createHabit({ ...valid, userId: userId as never }),
    ).rejects.toThrow(/user/i);
    expect(await count()).toBe(0);
  });
});

describe("createHabit, edge cases", () => {
  it("stores only the known schedule keys", async () => {
    const habit = await createHabit({
      ...valid,
      schedule: { ...mwf, times: 3, junk: "x" } as never,
    });
    expect(habit.schedule).toEqual(mwf);
    expect((await getHabit("u1", habit.id))?.schedule).toEqual(mwf);
  });

  it("allows duplicate titles", async () => {
    const a = await createHabit(valid);
    const b = await createHabit(valid);
    expect(a.id).not.toBe(b.id);
    expect(await count()).toBe(2);
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
  it("returns all fields, with a string id equal to the one asked for", async () => {
    const created = await createHabit({ ...valid, description: "20 pages" });
    const habit = await getHabit("u1", created.id);
    expect(habit).toStrictEqual({
      id: created.id,
      userId: "u1",
      title: "Read",
      description: "20 pages",
      schedule: mwf,
      createdAt: created.createdAt,
    });
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
});

describe("getHabit, rainy day scenarios", () => {
  const unknownId = () => new mongoose.Types.ObjectId().toString();

  it("returns null for a well-formed id that does not exist", async () => {
    await createHabit(valid);
    await expect(getHabit("u1", unknownId())).resolves.toBeNull();
  });

  it.each(["abc", "z".repeat(24)])(
    "throws for the malformed id %j, not null",
    async (id) => {
      await expect(getHabit("u1", id)).rejects.toThrow(/invalid habit id/i);
    },
  );

  it("throws for a non-string id", async () => {
    await expect(getHabit("u1", null as never)).rejects.toThrow(
      /invalid habit id/i,
    );
  });
});

describe("getHabit, ownership", () => {
  it("returns null for a habit of another user", async () => {
    const created = await createHabit(valid);
    await expect(getHabit("u2", created.id)).resolves.toBeNull();
  });

  it.each(["   ", { $ne: null }])("throws for userId %j", async (userId) => {
    const created = await createHabit(valid);
    await expect(getHabit(userId as never, created.id)).rejects.toThrow(
      /user/i,
    );
  });
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
    expect(updated).toStrictEqual({ ...created, title: "Write" });
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

  it.each(["   ", null])(
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

  it("clears the description with only spaces", async () => {
    expect((await upd("   ", { description: "old" }))?.description).toBe("");
  });

  it("rejects a non-string description and changes nothing", async () => {
    const created = await createHabit({ ...valid, description: "old" });
    await expect(
      updateHabit("u1", created.id, { description: null as never }),
    ).rejects.toThrow(/description/i);
    expect(await getHabit("u1", created.id)).toEqual(created);
  });
});

describe("updateHabit, schedule rules", () => {
  it.each([null, { kind: "nope" }])(
    "rejects schedule %j and changes nothing",
    async (schedule) => {
      const created = await createHabit(valid);
      await expect(
        updateHabit("u1", created.id, { schedule: schedule as never }),
      ).rejects.toThrow();
      expect(await getHabit("u1", created.id)).toEqual(created);
    },
  );

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

  it("throws for a malformed id", async () => {
    await expect(updateHabit("u1", "abc", { title: "x" })).rejects.toThrow(
      /invalid habit id/i,
    );
  });

  it("rejects a blank userId", async () => {
    const created = await createHabit(valid);
    await expect(
      updateHabit("   ", created.id, { title: "x" }),
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

  it("updates an archived habit and keeps archivedAt", async () => {
    const archivedAt = new Date("2026-11-05T10:00:00Z");
    const id = await insertRaw({ archivedAt });
    const updated = await updateHabit("u1", id, { title: "Write" });
    expect(updated).toMatchObject({ title: "Write", archivedAt });
  });
});

describe("listHabits", () => {
  const list = async (...args: Parameters<typeof listHabits>) =>
    (await listHabits(...args)).habits;
  const ids = (habits: Habit[]) => habits.map((h) => h.id);
  const insertMany = (n: number) =>
    Promise.all(
      Array.from({ length: n }, (_, i) => insertRaw({ title: `H${i}` })),
    );

  it("returns every habit in full, oldest first, with both schedule kinds", async () => {
    const a = await createHabit({ ...valid, title: "A", description: "one" });
    const b = await createHabit({
      ...valid,
      title: "B",
      schedule: { kind: "perWeek", times: 3 },
    });
    const c = await createHabit({ ...valid, title: "C" });
    expect(await listHabits("u1")).toEqual({
      habits: [a, b, c],
      nextCursor: null,
    });
  });

  it("returns only the habits of that exact user", async () => {
    const mine = await createHabit(valid);
    for (const userId of ["u10", "U1", "u2"])
      await createHabit({ ...valid, userId });
    expect(await list("u1")).toEqual([mine]);
    await expect(listHabits("nobody")).resolves.toEqual({
      habits: [],
      nextCursor: null,
    });
  });

  it("leaves out archived habits and keeps archivedAt: null as active", async () => {
    const active = await insertRaw({ title: "Active" });
    await insertRaw({ title: "Archived", archivedAt: new Date() });
    const restored = await insertRaw({ title: "Null", archivedAt: null });
    expect(ids(await list("u1"))).toEqual([active, restored]);
  });

  it("trims the userId", async () => {
    const created = await createHabit(valid);
    expect(await list(" u1 ")).toEqual([created]);
  });

  it.each(["   ", null])("rejects userId %j", async (userId) => {
    await expect(listHabits(userId as never)).rejects.toThrow(/user/i);
  });

  describe("pagination", () => {
    it("walks all pages with the cursor, with no gaps or repeats", async () => {
      const all = await insertMany(5);
      const p1 = await listHabits("u1", { limit: 2 });
      expect(ids(p1.habits)).toEqual(all.slice(0, 2));
      expect(p1.nextCursor).toBe(all[1]);
      const p2 = await listHabits("u1", { limit: 2, after: p1.nextCursor! });
      expect(ids(p2.habits)).toEqual(all.slice(2, 4));
      expect(p2.nextCursor).toBe(all[3]);
      const p3 = await listHabits("u1", { limit: 2, after: p2.nextCursor! });
      expect(ids(p3.habits)).toEqual(all.slice(4));
      expect(p3.nextCursor).toBeNull();
    });

    it("has no next cursor when the last page is exactly full", async () => {
      await insertMany(4);
      const page = await listHabits("u1", { limit: 4 });
      expect(page.habits).toHaveLength(4);
      expect(page.nextCursor).toBeNull();
    });

    it("pages by 50 by default and never returns more", async () => {
      const all = await insertMany(51);
      const first = await listHabits("u1");
      expect(ids(first.habits)).toEqual(all.slice(0, 50));
      expect(first.nextCursor).toBe(all[49]);
      const second = await listHabits("u1", { after: first.nextCursor! });
      expect(ids(second.habits)).toEqual([all[50]]);
      expect(second.nextCursor).toBeNull();
    });

    it("accepts limits 1 and 50", async () => {
      await insertMany(2);
      await expect(listHabits("u1", { limit: 1 })).resolves.toBeDefined();
      await expect(listHabits("u1", { limit: 50 })).resolves.toBeDefined();
    });

    it.each([0, 1.5, 51, "5", null])("rejects limit %j", async (limit) => {
      await expect(listHabits("u1", { limit: limit as never })).rejects.toThrow(
        /limit/i,
      );
    });

    it.each(["abc", null])("rejects cursor %j", async (after) => {
      await expect(listHabits("u1", { after: after as never })).rejects.toThrow(
        /invalid habit id/i,
      );
    });

    it("still continues when the habit in the cursor was archived", async () => {
      const [a, b, c] = await insertMany(3);
      await mongoose.connection
        .collection("habits")
        .updateOne(
          { _id: new mongoose.Types.ObjectId(b) },
          { $set: { archivedAt: new Date() } },
        );
      expect(ids(await list("u1", { after: b }))).toEqual([c]);
      expect(ids(await list("u1"))).toEqual([a, c]);
    });

    it("does not show another user's habits through a cursor", async () => {
      const theirs = await insertRaw({ userId: "u2" });
      const mine = await insertRaw({});
      expect(ids(await list("u1", { after: theirs }))).toEqual([mine]);
      expect(ids(await list("u2", { after: mine }))).toEqual([]);
    });
  });
});
