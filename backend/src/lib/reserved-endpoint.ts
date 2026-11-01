import { endpoints } from "../contracts/endpoints.ts";
import type { EndpointId } from "../contracts/endpoints.ts";
import { requireIngestionSecret } from "../integrations/apps-script.ts";
import { requireAdmin } from "../modules/auth/session.ts";
import { ApiError, defineHandler, readJsonObject } from "./http.ts";

export function reservedEndpoint(id: EndpointId) {
  const endpoint = endpoints[id];
  return defineHandler(id, async (request) => {
    if (endpoint.access === "integration") {
      requireIngestionSecret(request);
      await readJsonObject(request);
    }
    if (endpoint.access === "admin" || endpoint.access === "super-admin") {
      await requireAdmin(request, endpoint.access === "super-admin" ? "SUPER_ADMIN" : "ADMIN", endpoint.method !== "GET");
    }
    throw new ApiError(501, "FEATURE_NOT_IMPLEMENTED", `Endpoint ${id} is reserved for development.`);
  });
}
