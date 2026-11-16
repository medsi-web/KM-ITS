import type { Db } from "mongodb";
import { ApiError } from "./errors.ts";

// Each feature records readiness in `<feature>_control` only after its
// uniqueness indexes exist, so requests never run without those constraints.
type SchemaMarker = { _id: string; schemaVersion: number };

export async function requireSchema(database: Db, control: string, code: string, message: string): Promise<void> {
  const ready = await database.collection<SchemaMarker>(control).findOne({ _id: "schema", schemaVersion: 1 });
  if (!ready) throw new ApiError(503, code, message);
}

export async function markSchemaReady(database: Db, control: string): Promise<void> {
  await database.collection<SchemaMarker>(control).updateOne({ _id: "schema" }, { $set: { schemaVersion: 1 } }, { upsert: true });
}
