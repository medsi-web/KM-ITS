import { reservedEndpoint } from "../../lib/reserved-endpoint.ts";

export const archivesList = reservedEndpoint("archives.list");
export const archivesDetail = reservedEndpoint("archives.detail");
export const archivesOpen = reservedEndpoint("archives.open");
export { archivesAdminList, archivesAdminDetail, archivesPublish, archivesUnpublish } from "./admin.ts";
