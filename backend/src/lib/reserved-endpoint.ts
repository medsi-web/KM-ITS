import { endpoints } from "../contracts/endpoints.ts";
import type { EndpointId } from "../contracts/endpoints.ts";
import { requireIngestionSecret } from "../integrations/apps-script.ts";
import { ApiError, defineHandler, readJsonObject } from "./http.ts";

export function reservedEndpoint(id: EndpointId) {
  const endpoint = endpoints[id];
  return defineHandler(id, async (request) => {
    if (endpoint.access === "integration") {
      requireIngestionSecret(request);
      await readJsonObject(request);
    }
    // Admin/session functionality is unavailable, with no development bypass.
    // Session and role enforcement must precede implementing admin operations.
    throw new ApiError(501, "FEATURE_NOT_IMPLEMENTED", `Endpoint ${id} is reserved for development.`);
  });
}
