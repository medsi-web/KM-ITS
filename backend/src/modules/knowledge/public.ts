import { ApiError, defineHandler } from "../../lib/http.ts";
import { filterValue, readPagination, rejectUnknownQuery } from "../../lib/pagination.ts";
import { pathId } from "../../lib/request.ts";
import { ARCHIVE_LIST_COLLATION, visibleQuery } from "../archives/public.ts";
import { getArchiveStore } from "../archives/store.ts";
import { getKnowledgeStore, type KnowledgeGroup } from "./store.ts";
import { SLUG } from "./validation.ts";

export interface GroupStats { documentCount: number; lastDocumentAt: Date | null }

/**
 * Visible document count and newest visible document per ministry, matched
 * case-insensitively like `/api/archives?ministryId=`.
 */
export async function groupStats(ministryIds: string[]): Promise<{ get(ministryId: string): GroupStats | undefined }> {
  const stats = new Map<string, GroupStats>();
  const view = { get: (ministryId: string) => stats.get(ministryId.toLowerCase()) };
  if (!ministryIds.length) return view;
  const { archives } = await getArchiveStore();
  const rows = await archives.aggregate<{ _id: string; documentCount: number; lastDocumentAt: Date }>([
    { $match: { ...visibleQuery, ministryId: { $in: ministryIds } } },
    { $group: { _id: "$ministryId", documentCount: { $sum: 1 }, lastDocumentAt: { $max: "$updatedAt" } } },
  ], { collation: ARCHIVE_LIST_COLLATION }).toArray();
  for (const row of rows) stats.set(row._id.toLowerCase(), { documentCount: row.documentCount, lastDocumentAt: row.lastDocumentAt });
  return view;
}

export function publicGroup(group: KnowledgeGroup, stats?: GroupStats) {
  return {
    id: group._id, slug: group.slug, ministryId: group.ministryId,
    name: group.name, title: group.title, description: group.description, driveUrl: group.driveUrl,
    documentCount: stats?.documentCount ?? 0, lastDocumentAt: stats?.lastDocumentAt ?? null, updatedAt: group.updatedAt,
    documentsUrl: `/api/archives?ministryId=${encodeURIComponent(group.ministryId)}`,
  };
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SORTS = ["order", "name", "newest"] as const;
type View = ReturnType<typeof publicGroup>;
const byName = (a: View, b: View) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }) || a.id.localeCompare(b.id);

// Groups are few (one per ministry), so filtering, ordering and paging happen
// after one query and one aggregation rather than in the database.
export const knowledgeList = defineHandler("knowledge.list", async (request) => {
  const url = new URL(request.url);
  rejectUnknownQuery(url, ["q", "sort", "limit", "offset"]);
  const page = readPagination(url, 50, 100);
  const q = filterValue(url, "q", 100)?.trim();
  const sort = url.searchParams.get("sort") ?? "order";
  if (!(SORTS as readonly string[]).includes(sort)) throw new ApiError(400, "INVALID_FILTER", `sort must be one of: ${SORTS.join(", ")}.`);
  const { groups } = await getKnowledgeStore();
  const filter: Record<string, unknown> = { hidden: false };
  if (q) filter.$or = ["name", "title", "description"].map(key => ({ [key]: { $regex: escapeRegex(q), $options: "i" } }));
  const records = await groups.find(filter).toArray();
  const stats = await groupStats(records.map(group => group.ministryId));
  const order = new Map(records.map(group => [group._id, group.order]));
  const items = records.map(group => publicGroup(group, stats.get(group.ministryId)));
  items.sort(sort === "name" ? byName
    : sort === "newest" ? (a, b) => (b.lastDocumentAt?.getTime() ?? -1) - (a.lastDocumentAt?.getTime() ?? -1) || byName(a, b)
    : (a, b) => order.get(a.id)! - order.get(b.id)! || byName(a, b));
  return { items: items.slice(page.offset, page.offset + page.limit), total: items.length, limit: page.limit, offset: page.offset };
});

export const knowledgeDetail = defineHandler("knowledge.detail", async (request) => {
  const slug = pathId(request) ?? "";
  if (!SLUG.test(slug)) throw new ApiError(404, "KNOWLEDGE_GROUP_NOT_FOUND", "The knowledge group was not found.");
  const { groups } = await getKnowledgeStore();
  const group = await groups.findOne({ slug, hidden: false });
  if (!group) throw new ApiError(404, "KNOWLEDGE_GROUP_NOT_FOUND", "The knowledge group was not found.");
  return publicGroup(group, (await groupStats([group.ministryId])).get(group.ministryId));
});
