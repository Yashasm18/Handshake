// Fails CI if a number the site states about testing (web/src/lib/facts.ts) no longer matches reality.
//
//   node ../scripts/check-test-counts.mjs app        (from web/: the app suite)
//   node ../scripts/check-test-counts.mjs workflow   (from workflows/: the deadline workflow suite)
//
// The app check also counts the live scenarios recorded in docs/TESTING.md, and checks the totals the
// README and docs/TESTING.md state.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const facts = readFileSync(path.join(root, "web/src/lib/facts.ts"), "utf8");
const stated = (key) => Number(new RegExp(`\\b${key}:\\s*(\\d+)`).exec(facts)?.[1]);

const which = process.argv[2];
if (!["app", "workflow"].includes(which)) throw new Error("usage: check-test-counts.mjs app|workflow");

const out = execFileSync("npx", ["vitest", "run", "--reporter=json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
const actual = JSON.parse(out.slice(out.indexOf("{"))).numTotalTests;
const problems = [];
if (actual !== stated(which)) problems.push(`${which} tests: the site says ${stated(which)}, the suite has ${actual}`);

if (which === "app") {
  const doc = readFileSync(path.join(root, "docs/TESTING.md"), "utf8");
  const scenarios = new Set(doc.match(/^\| [A-Z]\d+ \|/gm) ?? []).size;
  if (scenarios !== stated("liveScenarios")) problems.push(`live scenarios: the site says ${stated("liveScenarios")}, docs/TESTING.md records ${scenarios}`);
  // The README and the testing doc state the same totals in words.
  const total = stated("app") + stated("workflow");
  const readme = readFileSync(path.join(root, "README.md"), "utf8");
  if (!readme.includes(`**${total} automated tests**`) || !readme.includes(`${stated("app")} for the app`)) problems.push(`README.md: expected "${total} automated tests" and "${stated("app")} for the app"`);
  if (!doc.includes(`Automated tests (${total}: ${stated("app")} for the app`) || !doc.includes(`| Count | ${total} tests |`)) problems.push(`docs/TESTING.md: expected ${total} tests (${stated("app")} for the app)`);
}

if (problems.length) {
  console.error(`Update web/src/lib/facts.ts:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`${which}: the site's numbers match (${actual} tests${which === "app" ? `, ${stated("liveScenarios")} live scenarios` : ""}).`);
