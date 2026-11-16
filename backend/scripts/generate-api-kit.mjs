// Generates (or with --check, verifies) the committed API kit: openapi.json,
// the Postman collections and the local Postman environment.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { endpoints } from "../src/contracts/endpoints.ts";
import { buildOpenApi } from "./api-kit/openapi.mjs";
import { environment, probeCollection } from "./api-kit/postman.mjs";
import { archiveWorkflow, articlesWorkflow, authWorkflow, timelineWorkflow } from "./api-kit/workflows.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");

const outputs = [
  ["openapi.json", buildOpenApi(endpoints)],
  ["postman/KMITS.postman_collection.json", probeCollection(endpoints)],
  ["postman/Local.postman_environment.json", environment],
  ["postman/Auth.postman_collection.json", authWorkflow],
  ["postman/Archive.postman_collection.json", archiveWorkflow],
  ["postman/Timeline.postman_collection.json", timelineWorkflow],
  ["postman/Articles.postman_collection.json", articlesWorkflow],
];

for (const [relative, content] of outputs) {
  const file = path.join(root, relative);
  const serialized = JSON.stringify(content, null, 2) + "\n";
  if (check) {
    if ((await readFile(file, "utf8")).replace(/\r\n/g, "\n") !== serialized) throw Error(`${relative} is out of date.`);
  } else {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, serialized);
  }
}

console.log(`${check ? "Verified" : "Generated"} ${Object.keys(endpoints).length} operations and ${authWorkflow.item.length} Auth, ${timelineWorkflow.item.length} Timeline and ${articlesWorkflow.item.length} Articles workflow requests.`);
