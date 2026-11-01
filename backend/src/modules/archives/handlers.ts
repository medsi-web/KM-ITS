import { reservedEndpoint } from "../../lib/reserved-endpoint.ts";

export const archivesList = reservedEndpoint("archives.list");
export const archivesDetail = reservedEndpoint("archives.detail");
export const archivesOpen = reservedEndpoint("archives.open");
export const archivesAdminList = reservedEndpoint("archives.adminList");
export const archivesAdminDetail = reservedEndpoint("archives.adminDetail");
export const archivesApprove = reservedEndpoint("archives.approve");
export const archivesReject = reservedEndpoint("archives.reject");
export const archivesPublish = reservedEndpoint("archives.publish");
export const archivesUnpublish = reservedEndpoint("archives.unpublish");
