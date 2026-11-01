import { reservedEndpoint } from "../../lib/reserved-endpoint.ts";

export const authLogin = reservedEndpoint("auth.login");
export const authMe = reservedEndpoint("auth.me");
export const authLogout = reservedEndpoint("auth.logout");
