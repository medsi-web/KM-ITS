type Endpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  group: string;
  access: "public" | "admin" | "super-admin" | "integration";
  summary: string;
  implemented?: boolean;
};

// Draft contract inventory. Reserved endpoints do not persist or expose domain data.
export const endpoints = {
  "system.health": { method: "GET", path: "/api/health", group: "System", access: "public", summary: "Check API liveness", implemented: true },
  "system.ready": { method: "GET", path: "/api/ready", group: "System", access: "public", summary: "Check MongoDB readiness", implemented: true },
  "auth.login": { method: "POST", path: "/api/auth/login", group: "Auth", access: "public", summary: "Sign in using username and password", implemented: true },
  "auth.password": { method: "POST", path: "/api/auth/password", group: "Auth", access: "admin", summary: "Change password and revoke existing sessions", implemented: true },
  "auth.me": { method: "GET", path: "/api/auth/me", group: "Auth", access: "admin", summary: "Read the current admin session", implemented: true },
  "auth.logout": { method: "POST", path: "/api/auth/logout", group: "Auth", access: "admin", summary: "End the current admin session", implemented: true },
  "accounts.list": { method: "GET", path: "/api/admin/accounts", group: "Accounts", access: "super-admin", summary: "List admin accounts", implemented: true },
  "accounts.create": { method: "POST", path: "/api/admin/accounts", group: "Accounts", access: "super-admin", summary: "Create an admin with a one-time temporary password", implemented: true },
  "accounts.update": { method: "PATCH", path: "/api/admin/accounts/{id}", group: "Accounts", access: "super-admin", summary: "Update admin status, name, or role", implemented: true },
  "accounts.resetPassword": { method: "POST", path: "/api/admin/accounts/{id}/reset-password", group: "Accounts", access: "super-admin", summary: "Reset another admin password and revoke sessions", implemented: true },
  "archives.list": { method: "GET", path: "/api/archives", group: "Archive", access: "public", summary: "List visible synchronized documents", implemented: true },
  "archives.detail": { method: "GET", path: "/api/archives/{id}", group: "Archive", access: "public", summary: "Read visible document metadata", implemented: true },
  "archives.open": { method: "GET", path: "/api/archives/{id}/open", group: "Archive", access: "public", summary: "Verify the active PDF and open its Drive source", implemented: true },
  "archives.adminList": { method: "GET", path: "/api/admin/archives", group: "Archive", access: "admin", summary: "List archive records and source state", implemented: true },
  "archives.adminDetail": { method: "GET", path: "/api/admin/archives/{id}", group: "Archive", access: "admin", summary: "Inspect the latest snapshot and source state", implemented: true },
  "archives.publish": { method: "POST", path: "/api/admin/archives/{id}/publish", group: "Archive", access: "admin", summary: "Clear manual hiding; invalid sources remain hidden", implemented: true },
  "archives.unpublish": { method: "POST", path: "/api/admin/archives/{id}/unpublish", group: "Archive", access: "admin", summary: "Manually hide a document", implemented: true },
  "knowledge.list": { method: "GET", path: "/api/knowledge-groups", group: "Knowledge", access: "public", summary: "List visible knowledge groups with document counts", implemented: true },
  "knowledge.detail": { method: "GET", path: "/api/knowledge-groups/{slug}", group: "Knowledge", access: "public", summary: "Read a visible knowledge group by slug", implemented: true },
  "knowledge.adminList": { method: "GET", path: "/api/admin/knowledge-groups", group: "Knowledge", access: "admin", summary: "List all knowledge groups and ministries without one", implemented: true },
  "knowledge.create": { method: "POST", path: "/api/admin/knowledge-groups", group: "Knowledge", access: "admin", summary: "Create a knowledge group for a registered ministry", implemented: true },
  "knowledge.update": { method: "PATCH", path: "/api/admin/knowledge-groups/{id}", group: "Knowledge", access: "admin", summary: "Edit a knowledge group at its current revision", implemented: true },
  "knowledge.delete": { method: "DELETE", path: "/api/admin/knowledge-groups/{id}", group: "Knowledge", access: "admin", summary: "Delete a knowledge group; its documents stay in Archive", implemented: true },
  "articles.list": { method: "GET", path: "/api/articles", group: "Articles", access: "public", summary: "List published articles", implemented: true },
  "articles.detail": { method: "GET", path: "/api/articles/{id}", group: "Articles", access: "public", summary: "Read a published article", implemented: true },
  "articles.adminList": { method: "GET", path: "/api/admin/articles", group: "Articles", access: "admin", summary: "List submitted articles and the review queue", implemented: true },
  "articles.adminDetail": { method: "GET", path: "/api/admin/articles/{id}", group: "Articles", access: "admin", summary: "Inspect source, draft and published versions", implemented: true },
  "articles.update": { method: "PATCH", path: "/api/admin/articles/{id}", group: "Articles", access: "admin", summary: "Edit the draft or reset it to the source", implemented: true },
  "articles.publish": { method: "POST", path: "/api/admin/articles/{id}/publish", group: "Articles", access: "admin", summary: "Publish the reviewed draft revision", implemented: true },
  "articles.unpublish": { method: "POST", path: "/api/admin/articles/{id}/unpublish", group: "Articles", access: "admin", summary: "Hide an article from the public", implemented: true },
  "events.list": { method: "GET", path: "/api/events", group: "Timeline", access: "public", summary: "List visible calendar events by window and lifecycle status", implemented: true },
  "events.detail": { method: "GET", path: "/api/events/{id}", group: "Timeline", access: "public", summary: "Read a visible event", implemented: true },
  "events.adminList": { method: "GET", path: "/api/admin/events", group: "Timeline", access: "admin", summary: "List synchronized events", implemented: true },
  "events.adminDetail": { method: "GET", path: "/api/admin/events/{id}", group: "Timeline", access: "admin", summary: "Inspect event synchronization state", implemented: true },
  "events.update": { method: "PATCH", path: "/api/admin/events/{id}", group: "Timeline", access: "admin", summary: "Update website visibility of a source event", implemented: true },
  "sync.archives": { method: "POST", path: "/api/internal/sync/archives", group: "Integration", access: "integration", summary: "Receive ordered, idempotent Drive archive observations", implemented: true },
  "sync.articles": { method: "POST", path: "/api/internal/sync/articles", group: "Integration", access: "integration", summary: "Receive ordered, idempotent Form article submission batches", implemented: true },
  "sync.events": { method: "POST", path: "/api/internal/sync/events", group: "Integration", access: "integration", summary: "Receive ordered, idempotent Google Calendar event batches", implemented: true },
  "sync.logs": { method: "GET", path: "/api/admin/sync-logs", group: "Integration", access: "admin", summary: "Inspect synchronization outcomes for archives, events or articles", implemented: true },
} as const satisfies Record<string, Endpoint>;

export type EndpointId = keyof typeof endpoints;
