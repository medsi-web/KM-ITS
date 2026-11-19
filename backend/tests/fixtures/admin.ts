import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { hashPassword } from "../../src/modules/auth/password.ts";
import { csrfForSession, opaqueToken, tokenHash } from "../../src/modules/auth/security.ts";
import { authCollections } from "../../src/modules/auth/store.ts";

export const ORIGIN = "http://localhost:3000";

// Creates one ADMIN and one SUPER_ADMIN with live sessions; returns their tokens.
export async function adminSessions(database: Db): Promise<{ admin: string; superAdmin: string }> {
  const auth = authCollections(database);
  const now = new Date();
  const tokens: string[] = [];
  for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
    const accountId = randomUUID();
    const token = opaqueToken();
    tokens.push(token);
    await auth.accounts.insertOne({ _id: accountId, username: `${role.toLowerCase()}-${accountId.slice(0, 8)}`, passwordHash: await hashPassword("Integration-Password-123!"),
      requirePasswordChange: false, name: role, role, active: true, authVersion: 0, createdBy: "test", createdAt: now, updatedAt: now });
    await auth.sessions.insertOne({ _id: tokenHash(token), accountId, authVersion: 0, createdAt: now, expiresAt: new Date(Date.now() + 3600000) });
  }
  return { admin: tokens[0], superAdmin: tokens[1] };
}

export function adminRequest(path: string, options: { token?: string; method?: string; body?: unknown; csrf?: boolean } = {}) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.cookie = `kmits_session=${options.token}`;
    headers.origin = ORIGIN;
    headers["x-csrf-token"] = options.csrf === false ? "wrong" : csrfForSession(options.token);
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${ORIGIN}${path}`, { method, headers, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
}

export async function data<T>(response: Response): Promise<T> {
  return (await response.json() as { data: T }).data;
}
