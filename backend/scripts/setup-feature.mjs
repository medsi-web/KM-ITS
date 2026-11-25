// Operator setup for one content feature: validates its environment
// configuration, then creates indexes and records schema readiness.
// Usage: node scripts/setup-feature.mjs <archives|timeline|articles>
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ApiError } from "../src/lib/http.ts";
import { articleSettings } from "../src/modules/articles/config.ts";
import { initializeArticles } from "../src/modules/articles/store.ts";
import { archiveSources } from "../src/modules/archives/sources.ts";
import { initializeArchives } from "../src/modules/archives/store.ts";
import { initializeKnowledge } from "../src/modules/knowledge/store.ts";
import { timelineSettings } from "../src/modules/events/config.ts";
import { initializeEvents } from "../src/modules/events/store.ts";

const limits = settings => `(batch ${settings.syncMaxItems}, page ${settings.pageDefaultLimit}/${settings.pageMaxLimit})`;

const features = {
  archives: {
    name: "Archive",
    validate: archiveSources,
    initialize: async database => { await initializeArchives(database); await initializeKnowledge(database); },
    ready: sources => `Archive and knowledge group indexes are ready; ${sources.length} source registrations validated.`,
  },
  timeline: {
    name: "Timeline",
    validate: timelineSettings,
    initialize: initializeEvents,
    ready: settings => `Timeline indexes are ready; calendar registration and limits validated ${limits(settings)}.`,
  },
  articles: {
    name: "Article",
    validate: articleSettings,
    initialize: initializeArticles,
    ready: settings => `Article indexes are ready; form registration and limits validated ${limits(settings)}.`,
  },
};

const feature = features[process.argv[2]];
if (!feature) {
  console.error(`Usage: setup-feature.mjs <${Object.keys(features).join("|")}>`);
  process.exit(1);
}

let client;
try {
  const validated = feature.validate();
  client = await getMongoClient();
  await feature.initialize(await getDatabase());
  console.log(feature.ready(validated));
} catch (error) {
  console.error(error instanceof ApiError ? `${error.code}: ${error.message}` : `${feature.name} setup failed. Check database configuration and index conflicts.`);
  process.exitCode = 1;
} finally {
  await client?.close();
}
