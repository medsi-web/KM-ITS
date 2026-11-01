import { reservedEndpoint } from "../../lib/reserved-endpoint.ts";

export const articlesList = reservedEndpoint("articles.list");
export const articlesDetail = reservedEndpoint("articles.detail");
export const articlesAdminList = reservedEndpoint("articles.adminList");
export const articlesAdminDetail = reservedEndpoint("articles.adminDetail");
export const articlesUpdate = reservedEndpoint("articles.update");
export const articlesPublish = reservedEndpoint("articles.publish");
export const articlesUnpublish = reservedEndpoint("articles.unpublish");
