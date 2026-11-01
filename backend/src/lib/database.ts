import { MongoClient } from "mongodb";
import { ApiError } from "./http.ts";

const databaseGlobal = globalThis as typeof globalThis & {
  kmitsMongoConnection?: Promise<MongoClient>;
};

// A shared pool per Node.js process, including development reloads. No connection at import/build time.
export async function getDatabase() {
  const uri = process.env.MONGODB_URI?.trim();
  const databaseName = process.env.MONGODB_DATABASE?.trim();
  if (!uri || !databaseName) {
    throw new ApiError(503, "DATABASE_NOT_CONFIGURED", "MongoDB configuration is required.");
  }
  if (!databaseGlobal.kmitsMongoConnection) {
    const client = new MongoClient(uri, {
      appName: "kmits-backend", maxPoolSize: 10,
      serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000,
      socketTimeoutMS: 2000, waitQueueTimeoutMS: 2000,
    });
    databaseGlobal.kmitsMongoConnection = client.connect().catch(async () => {
      databaseGlobal.kmitsMongoConnection = undefined;
      await client.close();
      throw new ApiError(503, "DATABASE_UNAVAILABLE", "MongoDB is unavailable.");
    });
  }
  return (await databaseGlobal.kmitsMongoConnection).db(databaseName);
}

export async function pingDatabase(): Promise<void> {
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "DATABASE_UNAVAILABLE", "MongoDB is unavailable.");
  }
}
