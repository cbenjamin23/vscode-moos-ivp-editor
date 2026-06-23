const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO_ROOT = path.resolve(__dirname, "..");

function loadLanguageSupport() {
  const code = fs.readFileSync(path.join(REPO_ROOT, "src", "language-support.js"), "utf8");
  const context = {
    require(name) {
      if (name === "vscode") {
        return {
          Range: class Range {},
          Diagnostic: class Diagnostic {},
          DiagnosticSeverity: { Warning: 1 }
        };
      }
      return require(name);
    },
    module: { exports: {} },
    exports: {},
    __dirname: path.join(REPO_ROOT, "src"),
    console
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return context.module.exports;
}

function assertResult(languageSupport, valueType, value, expectedStatus, expectedReason) {
  const result = languageSupport.validateGeometryValue(value, valueType);
  const label = `${valueType}: ${value}`;
  if (result.status !== expectedStatus) {
    throw new Error(`${label} expected status ${expectedStatus}, got ${result.status}`);
  }
  if (expectedReason && result.reason !== expectedReason) {
    throw new Error(`${label} expected reason ${expectedReason}, got ${result.reason}`);
  }
}

function main() {
  const languageSupport = loadLanguageSupport();

  const fixtures = [
    ["convex-polygon", "pts={0,0:100,0:100,100:0,100}", "valid"],
    ["convex-polygon", "0,0:100,0:100,100:0,100", "valid"],
    ["convex-polygon", "pts={0,0:100,0", "invalid", "malformed-standard-points"],
    ["convex-polygon", "pts={0,0:abc,0:100,100}", "invalid", "malformed-point-list"],
    ["convex-polygon", "pts={0,0:100,0}", "invalid", "too-few-polygon-points"],
    ["convex-polygon", "pts={0,0:100,100:0,100:100,0}", "invalid", "self-intersecting-polygon"],
    ["convex-polygon", "pts={0,0:100,0:50,50:100,100:0,100}", "invalid", "non-convex-polygon"],
    ["convex-polygon", "radial: x=0, y=0, radius=10, pts=8", "skipped", "unsupported-source-backed-syntax"],
    ["convex-polygon", "pts={0,0:100,0:100,100:0,100},label=alpha", "skipped", "unsupported-source-backed-syntax"],
    ["convex-polygon", "pts={0,0:100,0:100,100:0,100},foo=bar", "skipped", "unsupported-source-backed-syntax"],
    ["seglist", "pts={0,0:100,0}", "valid"],
    ["seglist", "0,0:100,0", "valid"],
    ["seglist", "pts={0,0:abc,0}", "invalid", "malformed-point-list"],
    ["seglist", "zigzag: x=0, y=0, height=20, width=50, swath=5", "skipped", "unsupported-source-backed-syntax"],
    ["seglist-or-polygon", "empty", "valid"],
    ["seglist-or-polygon", "start", "valid"],
    ["seglist-or-polygon", "0,0", "valid"],
    ["seglist-or-polygon", "0,0:100,0", "valid"],
    ["seglist-or-polygon", "pts={0,0:abc,0}", "invalid", "malformed-point-list"],
    ["seglist-or-polygon", "lawnmower: x=0, y=0, height=20, width=50, swath=5", "skipped", "unsupported-source-backed-syntax"],
    ["seglist-or-polygon", "radial: x=0, y=0, radius=10, pts=8", "skipped", "unsupported-source-backed-syntax"],
    ["contact-filter-region", "pts={0,0:100,0:100,100:0,100}", "valid"],
    ["contact-filter-region", "0,0:100,0:100,100:0,100", "valid"],
    ["contact-filter-region", "pts={0,0:100,0}", "invalid", "too-few-polygon-points"],
    ["contact-filter-region", "pts={0,0:100,100:0,100:100,0}", "invalid", "self-intersecting-polygon"],
    ["contact-filter-region", "pts={0,0:100,0:50,50:100,100:0,100}", "invalid", "non-convex-polygon"],
    ["contact-filter-region", "ellipse: x=0, y=0, major=10, minor=5, pts=16", "skipped", "unsupported-source-backed-syntax"]
  ];

  fixtures.forEach(([valueType, value, expectedStatus, expectedReason]) => {
    assertResult(languageSupport, valueType, value, expectedStatus, expectedReason);
  });

  console.log(`geometry parser fixtures: ${fixtures.length} passed`);
}

main();
