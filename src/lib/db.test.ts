import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { connectDb } from "./db";

// Pattern for repository tests: a throwaway in-memory Mongo per test file, emptied before each test.
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  await connectDb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

const Note = mongoose.model("Note", new mongoose.Schema({ text: { type: String, required: true } }));

it("stores and reads back a document", async () => {
  await Note.create({ text: "hello" });

  const note = await Note.findOne({ text: "hello" });

  expect(note?.text).toBe("hello");
});

it("rejects a document that breaks the schema", async () => {
  await expect(Note.create({})).rejects.toThrow(/text.*required/);
});
