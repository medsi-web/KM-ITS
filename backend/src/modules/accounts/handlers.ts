import { reservedEndpoint } from "../../lib/reserved-endpoint.ts";

export const accountsList = reservedEndpoint("accounts.list");
export const accountsCreate = reservedEndpoint("accounts.create");
export const accountsUpdate = reservedEndpoint("accounts.update");
