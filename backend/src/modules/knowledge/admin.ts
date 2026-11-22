import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { ApiError, defineHandler, readJsonObject } from "../../lib/http.ts";
import { readPagination } from "../../lib/pagination.ts";
import { pathId } from "../../lib/request.ts";
import { archiveSources } from "../archives/sources.ts";
import { assertCurrentActor, requireAdmin } from "../auth/session.ts";
import { accessTransaction, audit, getAuthStore } from "../auth/store.ts";
import { groupStats, publicGroup, type GroupStats } from "./public.ts";
import { getKnowledgeStore, type KnowledgeGroup, type KnowledgeStore } from "./store.ts";
import { parseCreate, parseUpdate, type GroupFields } from "./validation.ts";

const notFound = () => new ApiError(404, "KNOWLEDGE_GROUP_NOT_FOUND", "The knowledge group was not found.");

export function adminGroup(group: KnowledgeGroup, stats?: GroupStats) {
  return {
    ...publicGroup(group, stats), order: group.order, hidden: group.hidden, revision: group.revision,
    createdBy: group.createdBy, updatedBy: group.updatedBy, createdAt: group.createdAt,
  };
}

const auditState = (group: KnowledgeGroup) => ({
  slug: group.slug, ministryId: group.ministryId, name: group.name, title: group.title, description: group.description,
  driveUrl: group.driveUrl, order: group.order, hidden: group.hidden, revision: group.revision,
});

// One group per ministry and one owner per slug. The unique indexes are the
// final guard; this check returns a precise 409 first.
async function assertAvailable(store: KnowledgeStore, fields: Partial<GroupFields>, session: ClientSession, exceptId?: string) {
  const others = exceptId ? { _id: { $ne: exceptId } } : {};
  if (fields.slug && await store.groups.findOne({ slug: fields.slug, ...others }, { session })) {
    throw new ApiError(409, "KNOWLEDGE_GROUP_SLUG_TAKEN", "Another knowledge group already uses this slug.");
  }
  if (fields.ministryId && await store.groups.findOne({ ministryId: fields.ministryId, ...others }, { session })) {
    throw new ApiError(409, "KNOWLEDGE_GROUP_EXISTS", "This ministry already has a knowledge group.");
  }
}

// accessTransaction maps raw duplicate keys to an account error, so a unique
// index violation is translated here, inside the transaction callback.
async function write(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      throw new ApiError(409, "KNOWLEDGE_GROUP_EXISTS", "The slug or ministry is already used by another knowledge group.");
    }
    throw error;
  }
}

function registeredMinistries(): string[] {
  try { return [...new Set(archiveSources().map(source => source.ministryId))]; } catch { return []; }
}

export const knowledgeAdminList = defineHandler("knowledge.adminList", async (request) => {
  await requireAdmin(request, "ADMIN");
  const page = readPagination(new URL(request.url), 50, 100);
  const { groups } = await getKnowledgeStore();
  const [records, total, assigned] = await Promise.all([
    groups.find({}).sort({ order: 1, name: 1, _id: 1 }).skip(page.offset).limit(page.limit).toArray(),
    groups.countDocuments({}),
    groups.distinct("ministryId"),
  ]);
  const stats = await groupStats(records.map(group => group.ministryId));
  return {
    items: records.map(group => adminGroup(group, stats.get(group.ministryId))), total, limit: page.limit, offset: page.offset,
    // Registered ministries that have documents but no group yet.
    unassignedMinistries: registeredMinistries().filter(id => !assigned.includes(id)),
  };
});

export const knowledgeCreate = defineHandler("knowledge.create", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true);
  const fields = parseCreate(await readJsonObject(request));
  const auth = await getAuthStore();
  const store = await getKnowledgeStore();
  const group = await accessTransaction(auth, async (session) => {
    const actor = await assertCurrentActor(auth, context, session, false);
    await assertAvailable(store, fields, session);
    const now = new Date();
    const record: KnowledgeGroup = { _id: randomUUID(), ...fields, revision: 1, createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now };
    await write(() => store.groups.insertOne(record, { session }));
    await audit(auth, session, "knowledge.created", actor._id, record._id, {
      actor: { id: actor._id, username: actor.username, role: actor.role }, after: auditState(record),
    });
    return record;
  });
  return adminGroup(group, (await groupStats([group.ministryId])).get(group.ministryId));
});

// The revision guards against overwriting another admin's edit.
export const knowledgeUpdate = defineHandler("knowledge.update", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true);
  const { revision, changes } = parseUpdate(await readJsonObject(request));
  const id = pathId(request) ?? "";
  const auth = await getAuthStore();
  const store = await getKnowledgeStore();
  const group = await accessTransaction(auth, async (session) => {
    const actor = await assertCurrentActor(auth, context, session, false);
    const before = await store.groups.findOne({ _id: id }, { session });
    if (!before) throw notFound();
    if (before.revision !== revision) {
      throw new ApiError(409, "KNOWLEDGE_GROUP_CHANGED", "The group changed since it was loaded. Reload and apply the edit again.");
    }
    await assertAvailable(store, changes, session, id);
    const after: KnowledgeGroup = { ...before, ...changes, revision: before.revision + 1, updatedBy: actor._id, updatedAt: new Date() };
    await write(() => store.groups.replaceOne({ _id: id }, after, { session }));
    await audit(auth, session, "knowledge.updated", actor._id, id, {
      actor: { id: actor._id, username: actor.username, role: actor.role }, before: auditState(before), after: auditState(after),
    });
    return after;
  });
  return adminGroup(group, (await groupStats([group.ministryId])).get(group.ministryId));
});

// Deleting a group removes only its presentation. Archive documents stay and
// remain reachable through /api/archives.
export const knowledgeDelete = defineHandler("knowledge.delete", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true);
  const id = pathId(request) ?? "";
  const auth = await getAuthStore();
  const store = await getKnowledgeStore();
  return accessTransaction(auth, async (session) => {
    const actor = await assertCurrentActor(auth, context, session, false);
    const before = await store.groups.findOne({ _id: id }, { session });
    if (!before) throw notFound();
    await store.groups.deleteOne({ _id: id }, { session });
    await audit(auth, session, "knowledge.deleted", actor._id, id, {
      actor: { id: actor._id, username: actor.username, role: actor.role }, before: auditState(before),
    });
    return { id, deleted: true };
  });
});
