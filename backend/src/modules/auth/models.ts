export type AdminRole = "ADMIN" | "SUPER_ADMIN";

export interface AdminAccount {
  _id: string;
  email: string;
  googleSub?: string;
  name: string;
  role: AdminRole;
  active: boolean;
  authVersion: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface AdminSession {
  _id: string; // SHA-256 of the random cookie token; never store the raw token.
  accountId: string;
  authVersion: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface OAuthAttempt {
  _id: string; // Hash of state
  browserHash: string;
  verifier: string;
  nonce: string;
  expiresAt: Date;
}

export interface AdminControl { _id: string; revision: number; bootstrapAccountId?: string }
export interface RateLimit { _id: string; count: number; expiresAt: Date }
export interface AdminAudit {
  _id: string;
  action: string;
  actorId: string;
  targetId: string;
  at: Date;
  changes?: Record<string, unknown>;
}

export function publicAccount(account: AdminAccount) {
  return {
    id: account._id, email: account.email, name: account.name,
    role: account.role, active: account.active, linked: Boolean(account.googleSub),
    createdAt: account.createdAt, updatedAt: account.updatedAt,
    lastLoginAt: account.lastLoginAt ?? null,
  };
}
