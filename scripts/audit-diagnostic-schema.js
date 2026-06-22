const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

function behaviorOrder() {
  const file = path.join(REPO_ROOT, "examples", "all_behaviors.bhv");
  const text = fs.readFileSync(file, "utf8");
  const order = [];
  const seen = new Set();
  for (const match of text.matchAll(/^\s*Behavior\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/gm)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      order.push(match[1]);
    }
  }
  return order;
}

function diagnosticCount(parameters = {}) {
  return Object.values(parameters).filter((entry) => entry.diagnostic === true).length;
}

function main() {
  const schema = loadJson("data/diagnostic-schema.json");
  const inventory = loadJson("data/bhv-inventory.json");
  const sharedCount = diagnosticCount(schema.shared?.ivpBehavior || {});

  console.log(`shared IvPBehavior diagnostic schemas: ${sharedCount}`);
  console.log("");
  console.log("all_behaviors.bhv coverage:");

  for (const behavior of behaviorOrder()) {
    const inventoryParams = inventory.items?.[behavior]?.parameters || [];
    const ownerSchema = schema.behaviors?.[behavior]?.parameters || {};
    const ownerDiagnosticCount = diagnosticCount(ownerSchema);
    const ownerKnownCount = Object.keys(ownerSchema).length;
    const status = ownerKnownCount ? "started" : "pending";
    console.log(
      `${behavior}: ${status}; ${ownerKnownCount} owner schemas, ${ownerDiagnosticCount} owner diagnostics, ${inventoryParams.length} inventory params`
    );
  }
}

main();
