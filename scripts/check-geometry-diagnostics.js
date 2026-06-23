const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO_ROOT = path.resolve(__dirname, "..");

class Range {
  constructor(startLine, startCharacter, endLine, endCharacter) {
    this.start = { line: startLine, character: startCharacter };
    this.end = { line: endLine, character: endCharacter };
  }
}

class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}

function loadLanguageSupport() {
  const code = fs.readFileSync(path.join(REPO_ROOT, "src", "language-support.js"), "utf8");
  const context = {
    require(name) {
      if (name === "vscode") {
        return {
          Range,
          Diagnostic,
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

function documentFromText(text) {
  const lines = text.split(/\n/);
  return {
    uri: "geometry-diagnostics-fixture.bhv",
    lineCount: lines.length,
    lineAt(lineNumber) {
      return { text: lines[lineNumber] || "" };
    }
  };
}

function assertDiagnosticCount(languageSupport, schema, name, language, text, expectedCount) {
  const collect = language === "moos"
    ? languageSupport.collectMoosDiagnostics
    : languageSupport.collectBehaviorDiagnostics;
  const diagnostics = collect(documentFromText(text), schema);
  if (diagnostics.length !== expectedCount) {
    const details = diagnostics.map((diagnostic) => diagnostic.message).join("; ");
    throw new Error(`${name} expected ${expectedCount} diagnostics, got ${diagnostics.length}: ${details}`);
  }
}

function assertDiagnosticMessageIncludes(languageSupport, schema, name, language, text, expectedText) {
  const collect = language === "moos"
    ? languageSupport.collectMoosDiagnostics
    : languageSupport.collectBehaviorDiagnostics;
  const diagnostics = collect(documentFromText(text), schema);
  if (!diagnostics.some((diagnostic) => diagnostic.message.includes(expectedText))) {
    const details = diagnostics.map((diagnostic) => diagnostic.message).join("; ");
    throw new Error(`${name} expected diagnostic containing "${expectedText}", got: ${details}`);
  }
}

function main() {
  const languageSupport = loadLanguageSupport();
  const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "data", "diagnostic-schema.json"), "utf8"));

  const validConvex = "0,0:100,0:100,100:0,100";
  const invalidSelfCrossing = "0,0:100,100:0,100:100,0";
  const invalidNonConvex = "0,0:100,0:50,50:100,100:0,100";
  const deferredGenerated = "radial: x=0, y=0, radius=10, pts=8";

  const cases = [
    ["BHV_Loiter valid polygon", `Behavior = BHV_Loiter\n{\n  polygon = ${validConvex}\n}`, 0],
    ["BHV_Loiter self-crossing polygon", `Behavior = BHV_Loiter\n{\n  polygon = ${invalidSelfCrossing}\n}`, 1],
    ["BHV_Loiter non-convex polygon", `Behavior = BHV_Loiter\n{\n  polygon = ${invalidNonConvex}\n}`, 1],
    ["BHV_Loiter deferred generated polygon", `Behavior = BHV_Loiter\n{\n  polygon = ${deferredGenerated}\n}`, 0],
    ["BHV_AvoidObstacleV24 non-convex polygon", `Behavior = BHV_AvoidObstacleV24\n{\n  polygon = ${invalidNonConvex}\n}`, 1],
    ["BHV_AvoidObstacleV24 non-convex poly alias", `Behavior = BHV_AvoidObstacleV24\n{\n  poly = ${invalidNonConvex}\n}`, 1],
    ["BHV_AvoidObstacleV24 skips deferred generated polygon", `Behavior = BHV_AvoidObstacleV24\n{\n  polygon = ${deferredGenerated}\n}`, 0],
    ["BHV_OpRegionRecover non-convex polygon", `Behavior = BHV_OpRegionRecover\n{\n  polygon = ${invalidNonConvex}\n}`, 1],
    ["BHV_OpRegionV24 non-convex core_poly", `Behavior = BHV_OpRegionV24\n{\n  core_poly = ${invalidNonConvex}\n}`, 1],
    ["BHV_OpRegionV24 non-convex save_poly", `Behavior = BHV_OpRegionV24\n{\n  save_poly = ${invalidNonConvex}\n}`, 1],
    ["BHV_OpRegionV24 non-convex halt_poly", `Behavior = BHV_OpRegionV24\n{\n  halt_poly = ${invalidNonConvex}\n}`, 1],
    ["Unrelated block polygon stays block-specific", `Behavior = BHV_AbortToPoint\n{\n  polygon = ${invalidNonConvex}\n}`, 0],
    ["BHV_Waypoint accepts empty points", "Behavior = BHV_Waypoint\n{\n  points = empty\n}", 0],
    ["BHV_Waypoint accepts start xpoints", "Behavior = BHV_Waypoint\n{\n  xpoints = start\n}", 0],
    ["BHV_Waypoint accepts one-point seglist", "Behavior = BHV_Waypoint\n{\n  points = 0,0\n}", 0],
    ["BHV_Waypoint accepts polygon-like point list", `Behavior = BHV_Waypoint\n{\n  polygon = ${validConvex}\n}`, 0],
    ["BHV_Waypoint rejects malformed point list", "Behavior = BHV_Waypoint\n{\n  points = pts={0,0:abc,0}\n}", 1],
    ["BHV_Waypoint skips deferred generated path", "Behavior = BHV_Waypoint\n{\n  points = lawnmower: x=0, y=0, height=20, width=50, swath=5\n}", 0],
    ["Unrelated block points stays block-specific", "Behavior = BHV_AbortToPoint\n{\n  points = pts={0,0:abc,0}\n}", 0],
    ["Contact behavior accepts match_region", `Behavior = BHV_AvoidCollision\n{\n  match_region = ${validConvex}\n}`, 0],
    ["Contact behavior rejects malformed match_region", "Behavior = BHV_AvoidCollision\n{\n  match_region = pts={0,0:abc,0}\n}", 1],
    ["Contact behavior rejects self-crossing ignore_region", `Behavior = BHV_AvoidCollision\n{\n  ignore_region = ${invalidSelfCrossing}\n}`, 1],
    ["Contact behavior rejects non-convex ignore_region", `Behavior = BHV_AvoidCollision\n{\n  ignore_region = ${invalidNonConvex}\n}`, 1],
    ["Contact behavior skips deferred generated region", `Behavior = BHV_AvoidCollision\n{\n  match_region = ${deferredGenerated}\n}`, 0],
    ["Unrelated behavior region stays block-specific", `Behavior = BHV_Loiter\n{\n  match_region = ${invalidNonConvex}\n}`, 0],
    ["pContactMgrV20 rejects malformed match_region", "ProcessConfig = pContactMgrV20\n{\n  match_region = pts={0,0:abc,0}\n}", 1],
    ["pContactMgrV20 accepts ignore_region", `ProcessConfig = pContactMgrV20\n{\n  ignore_region = ${validConvex}\n}`, 0]
  ];

  cases.forEach(([name, text, expectedCount]) => {
    const language = text.includes("ProcessConfig") ? "moos" : "ivp-behavior";
    assertDiagnosticCount(languageSupport, schema, name, language, text, expectedCount);
  });

  const messageCases = [
    ["malformed standard points", "Behavior = BHV_Loiter\n{\n  polygon = pts={0,0:100,0\n}", "has malformed pts={...} syntax"],
    ["malformed point list", "Behavior = BHV_Loiter\n{\n  polygon = pts={0,0:abc,0:100,100}\n}", "has a malformed point list"],
    ["too few polygon points", "Behavior = BHV_Loiter\n{\n  polygon = pts={0,0:100,0}\n}", "has too few points for a polygon"],
    ["self-crossing polygon", `Behavior = BHV_Loiter\n{\n  polygon = ${invalidSelfCrossing}\n}`, "is self-intersecting"],
    ["non-convex polygon", `Behavior = BHV_Loiter\n{\n  polygon = ${invalidNonConvex}\n}`, "is not convex"]
  ];

  messageCases.forEach(([name, text, expectedText]) => {
    assertDiagnosticMessageIncludes(languageSupport, schema, name, "ivp-behavior", text, expectedText);
  });

  console.log(`geometry diagnostic fixtures: ${cases.length + messageCases.length} passed`);
}

main();
