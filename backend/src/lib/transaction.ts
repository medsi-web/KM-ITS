import type { ClientSession } from "mongodb";
import { getMongoClient } from "./database.ts";

/** True for a MongoDB unique-index violation. */
export function isDuplicateKey(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}

// Snapshot transaction with majority commit. Concurrent first inserts of the
// same source identity surface as duplicate keys; rerun them so the loser
// observes the winner's record instead of failing.
export async function sourceTransaction<T>(action: (session: ClientSession) => Promise<T>): Promise<T> {
  const client = await getMongoClient();
  for (let attempt = 0; ; attempt++) {
    const session = client.startSession();
    try {
      return await session.withTransaction(() => action(session), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 5000 });
    } catch (error) {
      if (attempt < 3 && isDuplicateKey(error)) continue;
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
