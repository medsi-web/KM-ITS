// Prints an Argon2id hash for BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH. The password
// is typed twice without echo, or read from stdin when piped. It is never
// written anywhere; only the hash is printed.
import { createInterface } from "node:readline";
import { hashPassword, validPassword } from "../src/modules/auth/password.ts";

async function readPiped() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input.replace(/\r?\n$/, "");
}

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(prompt)) process.stdout.write(prompt); };
    rl.question(prompt, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

try {
  let password;
  if (process.stdin.isTTY) {
    password = await ask("New password (12-128 characters): ");
    if ((await ask("Repeat password: ")) !== password) throw new Error("Passwords do not match.");
  } else {
    password = await readPiped();
  }
  if (!validPassword(password)) throw new Error("Password must contain 12 to 128 characters.");
  console.log(`\nBOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH='${await hashPassword(password)}'`);
  console.log("\nPut this line in frontend/.env.local (or the server's secret store), then run pnpm auth:bootstrap.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Hashing failed.");
  process.exitCode = 1;
}
