import { reservedEndpoint } from "../../lib/reserved-endpoint.ts";

export const syncArchives = reservedEndpoint("sync.archives");
export const syncArticles = reservedEndpoint("sync.articles");
export const syncEvents = reservedEndpoint("sync.events");
export const syncLogs = reservedEndpoint("sync.logs");
