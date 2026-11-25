import type { Db } from "mongodb";
import { getDatabase } from "../../lib/database.ts";
import { markSchemaReady, requireSchema } from "../../lib/schema.ts";

// A knowledge group is the website's presentation of one ministry's Archive
// documents: name, description and the ministry's shared Drive folder link.
// Folder registration stays in the config file (archive.sources); groups only
// describe a registered ministryId and never change which documents exist.
export interface KnowledgeGroup {
  _id: string;
  slug: string;
  ministryId: string;
  name: string;
  title: string;
  description: string;
  driveUrl: string;
  order: number;
  hidden: boolean;
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function knowledgeCollections(database: Db) {
  return { groups: database.collection<KnowledgeGroup>("knowledge_groups") };
}
export type KnowledgeStore = ReturnType<typeof knowledgeCollections>;

export async function getKnowledgeStore(): Promise<KnowledgeStore> {
  const database = await getDatabase();
  await requireSchema(database, "knowledge_control", "KNOWLEDGE_NOT_INITIALIZED", "Run Archive setup before serving knowledge groups.");
  return knowledgeCollections(database);
}

// Called by `pnpm archives:setup`; knowledge groups belong to the Archive feature.
export async function initializeKnowledge(database: Db): Promise<void> {
  const { groups } = knowledgeCollections(database);
  await groups.createIndex({ slug: 1 }, { unique: true });
  await groups.createIndex({ ministryId: 1 }, { unique: true });
  await groups.createIndex({ hidden: 1, order: 1, name: 1 });
  await markSchemaReady(database, "knowledge_control");
}
