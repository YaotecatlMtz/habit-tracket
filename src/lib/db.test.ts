import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

// Pattern for repository tests: a throwaway in-memory Mongo per test file, emptied before each test.
let server: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = await new MongoClient(server.getUri()).connect();
  db = client.db("test");
});

afterAll(async () => {
  await client.close();
  await server.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
});

it("stores and reads back a document", async () => {
  await db.collection("habits").insertOne({ name: "Read 10 pages" });

  const habit = await db.collection("habits").findOne({ name: "Read 10 pages" });

  expect(habit?.name).toBe("Read 10 pages");
});
