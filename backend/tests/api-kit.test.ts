import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Script } from "node:vm";
import { endpoints } from "../src/contracts/endpoints.ts";

test("every declared method has a real thin Next.js adapter pointing to a backend export", async () => {
  for (const [id, endpoint] of Object.entries(endpoints)) {
    const route = endpoint.path.replace("{id}", "[id]");
    const adapter = await readFile(new URL(`../../frontend/src/app${route}/route.ts`, import.meta.url), "utf8");
    const symbol = id.startsWith("system.") ? id.split(".")[1] : id.replace(/\.(.)/g, (_, letter: string) => letter.toUpperCase());
    assert.ok(adapter.includes(`${symbol} as ${endpoint.method}`), `${id} HTTP export`);
    assert.ok(adapter.includes('from "@kmits/backend"'), `${id} workspace boundary`);
    const domain = id.split(".")[0];
    const module = await readFile(new URL(`../src/modules/${domain}/handlers.ts`, import.meta.url), "utf8");
    assert.ok(module.includes(`export const ${symbol} =`), `${id} handler exists`);
  }
});

test("all generated Postman scripts parse before they reach a live server", async () => {
  type Item = { name?: string; event?: { script: { exec: string[] } }[]; item?: Item[] };
  function validate(item: Item) {
    for (const event of item.event ?? []) assert.doesNotThrow(() => new Script(event.script.exec.join("\n")), item.name);
    for (const child of item.item ?? []) validate(child);
  }
  for (const file of ["KMITS.postman_collection.json", "Auth.postman_collection.json"]) {
    validate(JSON.parse(await readFile(new URL(`../postman/${file}`, import.meta.url), "utf8")) as Item);
  }
});

test("OpenAPI covers the operation inventory and distinguishes readiness from reserved features", async () => {
  const spec = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8")) as {
    paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown>; "x-implementation-status": string }>>;
  };
  assert.equal(Object.values(spec.paths).reduce((count, methods) => count + Object.keys(methods).length, 0), Object.keys(endpoints).length);
  for (const [id, endpoint] of Object.entries(endpoints)) {
    const operation = spec.paths[endpoint.path][endpoint.method.toLowerCase()];
    assert.equal(operation.operationId, id);
    const implemented = "implemented" in endpoint && endpoint.implemented;
    assert.equal(operation["x-implementation-status"], implemented ? "implemented" : "reserved");
    if (!implemented) assert.ok(operation.responses["501"]);
    if (endpoint.access === "admin" || endpoint.access === "super-admin") assert.ok(operation.responses["401"]);
  }
});
