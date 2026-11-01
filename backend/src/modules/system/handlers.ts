import { pingDatabase } from "../../lib/database.ts";
import { defineHandler } from "../../lib/http.ts";

export const health = defineHandler("system.health", () => ({
  service: "kmits-api", status: "ok", stage: "foundation",
}));

export function createReadinessHandler(ping: () => Promise<void>) {
  return defineHandler("system.ready", async () => {
    await ping();
    return { service: "kmits-api", status: "ready", checks: { database: "ok" } };
  });
}

// Database readiness does not imply feature completeness.
export const ready = createReadinessHandler(pingDatabase);
