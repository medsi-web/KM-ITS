import { reservedEndpoint } from "../../lib/reserved-endpoint.ts";

export const eventsList = reservedEndpoint("events.list");
export const eventsDetail = reservedEndpoint("events.detail");
export const eventsAdminList = reservedEndpoint("events.adminList");
export const eventsAdminDetail = reservedEndpoint("events.adminDetail");
export const eventsUpdate = reservedEndpoint("events.update");
