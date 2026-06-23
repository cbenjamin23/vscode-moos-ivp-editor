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

function documentFromText(text, languageId) {
  const lines = text.split(/\r?\n/);
  if (/\r?\n$/.test(text)) {
    lines.pop();
  }

  return {
    uri: `${languageId}-formatting-fixture`,
    languageId,
    lineCount: lines.length,
    getText() {
      return text;
    },
    lineAt(lineNumber) {
      return { text: lines[lineNumber] || "" };
    }
  };
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name} failed\nExpected:\n${expected}\nActual:\n${actual}`);
  }
}

function assertClean(languageSupport, name, text, language, languageId) {
  const diagnostics = languageSupport.collectFormattingDiagnostics(
    documentFromText(text, languageId),
    language
  );
  if (diagnostics.length !== 0) {
    const details = diagnostics.map((diagnostic) => diagnostic.message).join("; ");
    throw new Error(`${name} expected 0 formatting diagnostics, got ${diagnostics.length}: ${details}`);
  }
}

function main() {
  const languageSupport = loadLanguageSupport();

  const moosInput = [
    "ProcessConfig=pHelmIvP {  ",
    "\tAppTick=4 // keep this comment",
    "   condition =  \"http://example.test/a//b\" // keep quoted slashes",
    "}",
    "   ",
    "",
    "ProcessConfig = pMarineViewer",
    "{",
    "  TIFF_FILE = viewer.tif   ",
    "}"
  ].join("\n");

  const moosExpected = [
    "ProcessConfig = pHelmIvP",
    "{",
    "  AppTick   = 4 // keep this comment",
    "  condition = \"http://example.test/a//b\" // keep quoted slashes",
    "}",
    "",
    "ProcessConfig = pMarineViewer",
    "{",
    "  TIFF_FILE = viewer.tif",
    "}"
  ].join("\n");

  const moosFormatted = languageSupport.formatMoosIvpText(moosInput, "moos").text;
  assertEqual("MOOS formatting", moosFormatted, moosExpected);
  assertClean(languageSupport, "MOOS formatted output", moosFormatted, "moos", "moos");

  const behaviorInput = [
    "initialize   DEPLOY = true",
    "Behavior=BHV_Waypoint {",
    " name=waypt_survey",
    " points = pts={0,0:50,0}",
    "}",
    "Behavior = BHV_Loiter",
    "{",
    "\tcondition = MODE=LOITERING",
    "}"
  ].join("\n");

  const behaviorExpected = [
    "initialize DEPLOY = true",
    "Behavior = BHV_Waypoint",
    "{",
    "  name   = waypt_survey",
    "  points = pts={0,0:50,0}",
    "}",
    "",
    "Behavior = BHV_Loiter",
    "{",
    "  condition = MODE=LOITERING",
    "}"
  ].join("\n");

  const behaviorFormatted = languageSupport.formatMoosIvpText(behaviorInput, "ivp-behavior").text;
  assertEqual("behavior formatting", behaviorFormatted, behaviorExpected);
  assertClean(
    languageSupport,
    "behavior formatted output",
    behaviorFormatted,
    "ivp-behavior",
    "ivp-behavior"
  );

  const alignedBehavior = [
    "Behavior = BHV_Loiter",
    "{",
    "  name    = loiter_geometry_observe",
    "  pwt     = 100",
    "  polygon = pts={0,0:100,0:100,100:0,100}",
    "}"
  ].join("\n");
  assertClean(
    languageSupport,
    "aligned behavior assignments",
    alignedBehavior,
    "ivp-behavior",
    "ivp-behavior"
  );

  console.log("formatting fixtures: 3 passed");
}

main();
