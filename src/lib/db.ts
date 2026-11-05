import mongoose from "mongoose";

// Cached on globalThis so dev hot-reloads reuse one connection instead of opening a new one per reload.
const globalForMongoose = globalThis as unknown as { mongooseConnection?: Promise<typeof mongoose> };

export function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.");
  globalForMongoose.mongooseConnection ??= mongoose.connect(uri).catch((error) => {
    globalForMongoose.mongooseConnection = undefined; // let the next call retry, e.g. after starting Docker
    throw error;
  });
  return globalForMongoose.mongooseConnection;
}
