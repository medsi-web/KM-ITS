import { hash, verify } from "@node-rs/argon2";
import { ApiError } from "../../lib/http.ts";
import { opaqueToken } from "./security.ts";

export function normalizedUsername(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) throw new ApiError(400, "INVALID_USERNAME", "Username must contain 3 to 64 ASCII letters, numbers, dots, underscores or hyphens.");
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) throw new ApiError(400, "INVALID_USERNAME", "Username must contain 3 to 64 ASCII letters, numbers, dots, underscores or hyphens.");
  return username;
}
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128 && Buffer.byteLength(value, "utf8") <= 512;
}
export async function hashPassword(value: unknown): Promise<string> {
  if (!validPassword(value)) throw new ApiError(400, "INVALID_PASSWORD", "Password must contain 12 to 128 characters (at most 512 UTF-8 bytes).");
  return hash(value, { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
}
// The bootstrap password arrives as a PHC-format Argon2id hash made by
// `pnpm auth:hash`, so the plaintext never sits in an environment file. Weaker
// cost parameters than hashPassword() uses are refused.
const ARGON2ID_PHC = /^\$argon2id\$v=19\$m=(\d{1,8}),t=(\d{1,3}),p=(\d{1,3})\$[A-Za-z0-9+/]{16,}\$[A-Za-z0-9+/]{32,}$/;
export function validPasswordHash(value: unknown): value is string {
  const match = typeof value === "string" ? ARGON2ID_PHC.exec(value.trim()) : null;
  return !!match && Number(match[1]) >= 19456 && Number(match[2]) >= 2 && Number(match[3]) >= 1;
}
// One random process-local dummy hash ensures nonexistent users also incur verification cost.
let dummyHash: Promise<string> | undefined;
export async function verifyPassword(passwordHash: string | undefined, value: unknown): Promise<boolean> {
  const usable = typeof passwordHash === "string" && passwordHash.startsWith("$argon2id$");
  const encoded = usable ? passwordHash : await (dummyHash ??= hashPassword(opaqueToken()));
  const matches = await verify(encoded, validPassword(value) ? value : "invalid-password-input").catch(() => false);
  return usable && validPassword(value) && matches;
}
export const temporaryPassword = opaqueToken;
