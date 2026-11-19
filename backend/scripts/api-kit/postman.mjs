// Postman building blocks, the anonymous probe collection and the local environment.

export const COLLECTION_SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

export const event = lines => [{ listen: "test", script: { type: "text/javascript", exec: lines } }];
export const assertCode = code => `pm.test("Error code", () => pm.expect(pm.response.json().error.code).to.eql("${code}"));`;

// Request options: `session`/`csrf` name the environment variables to send
// (false omits them); `integration` adds the ingestion bearer secret.
export const integration = { integration: true, session: false, csrf: false };
export const anonymous = { session: false };

export function item(name, method, route, body, status, lines = [], options = {}) {
  const header = [];
  if (options.session !== false) header.push({ key: "Cookie", value: `{{${options.session ?? "sessionCookie"}}}` });
  if (method !== "GET") header.push({ key: "Content-Type", value: "application/json" }, { key: "Origin", value: "{{baseUrl}}" });
  if (method !== "GET" && options.csrf !== false) header.push({ key: "X-CSRF-Token", value: `{{${options.csrf ?? "csrfToken"}}}` });
  if (options.integration) header.push({ key: "Authorization", value: "Bearer {{ingestionSecret}}" });
  // String bodies are sent verbatim so Postman can substitute numeric variables.
  const raw = body === undefined ? {} : { body: { mode: "raw", raw: typeof body === "string" ? body : JSON.stringify(body), options: { raw: { language: "json" } } } };
  return {
    name,
    protocolProfileBehavior: { followRedirects: false, disableCookies: true },
    request: { method, url: `{{baseUrl}}${route}`, header, ...raw },
    event: event([`pm.test("Expected status", () => pm.response.to.have.status(${status}));`, ...lines]),
  };
}

// Checks every response's envelope and caching headers.
export const commonChecks = event([
  'pm.test("JSON envelope", () => { const b = pm.response.json(); pm.expect(b.success).to.eql(pm.response.code < 400); pm.expect(b.meta.requestId).to.match(/^[0-9a-f-]{36}$/); pm.expect(Date.parse(b.meta.timestamp)).not.to.be.NaN; pm.expect(pm.response.headers.get("X-Request-Id")).to.eql(b.meta.requestId); });',
  'pm.test("No caching", () => pm.expect(pm.response.headers.get("Cache-Control")).to.include("no-store"));',
]);

// Expected status of an anonymous request to each operation.
function probeStatus(id, endpoint) {
  if (["admin", "super-admin"].includes(endpoint.access)) return 401;
  if (endpoint.access === "integration") return 'Number(pm.environment.get("integrationProbeStatus") || "401")';
  if (id === "auth.login") return 'Number(pm.environment.get("loginExpectedStatus") || "401")';
  if (id === "system.ready") return 'Number(pm.environment.get("readyExpectedStatus") || "503")';
  return ["system.health", "archives.list", "events.list", "articles.list"].includes(id) ? 200 : 404;
}

export function probeCollection(endpoints) {
  const probes = Object.entries(endpoints).map(([id, endpoint]) => {
    const protectedRoute = ["admin", "super-admin"].includes(endpoint.access);
    const body = id === "auth.login" ? { username: "nonexistent-probe", password: "incorrect probe password" } : endpoint.method !== "GET" ? {} : undefined;
    return item(`${endpoint.method} ${endpoint.path}`, endpoint.method, endpoint.path.replace("{id}", "{{recordId}}"), body,
      probeStatus(id, endpoint), protectedRoute ? [assertCode("UNAUTHENTICATED")] : [], { session: false, csrf: false });
  });
  return {
    info: { name: "KM ITS - Anonymous API Probes", schema: COLLECTION_SCHEMA, description: "Anonymous probes; initialized local database required for public archives. Configure expected readiness/integration statuses. Use Auth workflow for authenticated operations." },
    event: commonChecks,
    item: probes,
  };
}

const ENVIRONMENT_DEFAULTS = {
  baseUrl: "http://localhost:3000", recordId: "00000000-0000-4000-8000-000000000001",
  readyExpectedStatus: "503", loginExpectedStatus: "401", integrationProbeStatus: "401",
  username: "", password: "", newPassword: "", ingestionSecret: "", calendarId: "", formId: "", sessionCookie: "", csrfToken: "",
};

export const environment = {
  name: "KM ITS - Local",
  _postman_variable_scope: "environment",
  values: Object.entries(ENVIRONMENT_DEFAULTS).map(([key, value]) => ({ key, value, enabled: true, ...(/password|secret|cookie|token/i.test(key) ? { type: "secret" } : {}) })),
};
