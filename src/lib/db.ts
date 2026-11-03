import { MongoClient } from "mongodb";

// Cached on globalThis so dev hot-reloads reuse one connection instead of opening a new one per reload.
const globalForMongo = globalThis as unknown as { mongoClient?: Promise<MongoClient> };

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.");
  globalForMongo.mongoClient ??= new MongoClient(uri).connect();
  return (await globalForMongo.mongoClient).db();
}
