const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

function blockOrder(relativePath, pattern) {
  const file = path.join(REPO_ROOT, relativePath);
  const text = fs.readFileSync(file, "utf8");
  const order = [];
  const seen = new Set();
  for (const match of text.matchAll(pattern)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      order.push(match[1]);
    }
  }
  return order;
}

function behaviorOrder() {
  return blockOrder(
    path.join("examples", "all_behaviors.bhv"),
    /^\s*Behavior\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/gm
  );
}

function appOrder() {
  return blockOrder(
    path.join("examples", "all_apps.moos"),
    /^\s*ProcessConfig\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/gm
  );
}

function diagnosticCount(parameters = {}) {
  return Object.values(parameters).filter((entry) => entry.diagnostic === true).length;
}

function inheritedDiagnosticCount(schema, ownerSchema = {}) {
  return (ownerSchema.inherits || []).reduce((count, sharedName) => (
    count + diagnosticCount(schema.shared?.[sharedName] || {})
  ), 0);
}

function main() {
  const schema = loadJson("data/diagnostic-schema.json");
  const inventory = loadJson("data/bhv-inventory.json");
  const sharedIvPCount = diagnosticCount(schema.shared?.ivpBehavior || {});
  const sharedContactCount = diagnosticCount(schema.shared?.ivpContactBehavior || {});

  console.log(`shared IvPBehavior diagnostic schemas: ${sharedIvPCount}`);
  console.log(`shared IvPContactBehavior diagnostic schemas: ${sharedContactCount}`);
  console.log("");
  console.log("all_behaviors.bhv coverage:");

  for (const behavior of behaviorOrder()) {
    const inventoryParams = inventory.items?.[behavior]?.parameters || [];
    const behaviorSchema = schema.behaviors?.[behavior] || {};
    const ownerSchema = behaviorSchema.parameters || {};
    const ownerDiagnosticCount = diagnosticCount(ownerSchema);
    const inheritedCount = inheritedDiagnosticCount(schema, behaviorSchema);
    const ownerKnownCount = Object.keys(ownerSchema).length;
    const hasBehaviorSchema = Object.prototype.hasOwnProperty.call(schema.behaviors || {}, behavior);
    const status = ownerKnownCount ? "started" : (hasBehaviorSchema ? "reviewed-no-owner-contracts" : "pending");
    console.log(
      `${behavior}: ${status}; ${ownerKnownCount} owner schemas, ${ownerDiagnosticCount} owner diagnostics, ${inheritedCount} inherited diagnostics, ${inventoryParams.length} inventory params`
    );
  }

  console.log("");
  console.log("all_apps.moos coverage:");

  const appInventory = loadJson("data/moos-inventory.json");
  for (const app of appOrder()) {
    const inventoryParams = appInventory.items?.[app]?.parameters || [];
    const appSchema = schema.apps?.[app] || {};
    const ownerSchema = appSchema.parameters || {};
    const ownerDiagnosticCount = diagnosticCount(ownerSchema);
    const ownerKnownCount = Object.keys(ownerSchema).length;
    const hasAppSchema = Object.prototype.hasOwnProperty.call(schema.apps || {}, app);
    const status = ownerKnownCount ? "started" : (hasAppSchema ? "reviewed-no-owner-contracts" : "pending");
    console.log(
      `${app}: ${status}; ${ownerKnownCount} owner schemas, ${ownerDiagnosticCount} owner diagnostics, ${inventoryParams.length} inventory params`
    );
  }
}

main();
