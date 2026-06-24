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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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

  const preprocessorInput = [
    "ProcessConfig = pHelmIvP",
    "{",
    "  #ifdef SIM",
    "  AppTick=4",
    "  #else",
    "  AppTick=10",
    "  #endif",
    "}"
  ].join("\n");

  const preprocessorExpected = [
    "ProcessConfig = pHelmIvP",
    "{",
    "#ifdef SIM",
    "  AppTick = 4",
    "#else",
    "  AppTick = 10",
    "#endif",
    "}"
  ].join("\n");

  const preprocessorFormatted = languageSupport.formatMoosIvpText(preprocessorInput, "moos").text;
  assertEqual("MOOS preprocessor formatting", preprocessorFormatted, preprocessorExpected);
  assertClean(
    languageSupport,
    "MOOS preprocessor formatted output",
    preprocessorFormatted,
    "moos",
    "moos"
  );

  const behaviorPreprocessorInput = [
    "Behavior = BHV_Waypoint",
    "{",
    "  #ifndef SIM",
    "  speed=1.5",
    "  #endif",
    "}"
  ].join("\n");

  const behaviorPreprocessorExpected = [
    "Behavior = BHV_Waypoint",
    "{",
    "#ifndef SIM",
    "  speed = 1.5",
    "#endif",
    "}"
  ].join("\n");

  const behaviorPreprocessorFormatted = languageSupport.formatMoosIvpText(
    behaviorPreprocessorInput,
    "ivp-behavior"
  ).text;
  assertEqual(
    "behavior preprocessor formatting",
    behaviorPreprocessorFormatted,
    behaviorPreprocessorExpected
  );
  assertClean(
    languageSupport,
    "behavior preprocessor formatted output",
    behaviorPreprocessorFormatted,
    "ivp-behavior",
    "ivp-behavior"
  );

  const antlerInput = [
    "ProcessConfig = ANTLER",
    "{",
    "  MSBetweenLaunches=200",
    "",
    "  Run = MOOSDB @ NewConsole=false",
    "#ifdef LAUNCH_GUI yes",
    "  Run=pMarineViewer @ NewConsole = false",
    "#else",
    "  Run = pMissionHash@NewConsole=false",
    "#endif",
    "",
    "  Run              = pLogger @ NewConsole=false",
    "  Run = uFldShoreBroker @ NewConsole=false",
    "  Run = pShare @ NewConsole=false",
    "  Run = pXRelay @ NewConsole=true ~ pXRelay_APPLES",
    "  Run = pTool @ ExtraProcessParams=--mode=a=b",
    "}"
  ].join("\n");

  const antlerExpected = [
    "ProcessConfig = ANTLER",
    "{",
    "  MSBetweenLaunches = 200",
    "",
    "  Run = MOOSDB          @ NewConsole = false",
    "#ifdef LAUNCH_GUI yes",
    "  Run = pMarineViewer   @ NewConsole = false",
    "#else",
    "  Run = pMissionHash    @ NewConsole = false",
    "#endif",
    "",
    "  Run = pLogger         @ NewConsole = false",
    "  Run = uFldShoreBroker @ NewConsole = false",
    "  Run = pShare          @ NewConsole = false",
    "  Run = pXRelay         @ NewConsole = true ~ pXRelay_APPLES",
    "  Run = pTool           @ ExtraProcessParams = --mode=a=b",
    "}"
  ].join("\n");

  const antlerFormatted = languageSupport.formatMoosIvpText(antlerInput, "moos").text;
  assertEqual("ANTLER Run formatting", antlerFormatted, antlerExpected);
  assertClean(
    languageSupport,
    "ANTLER Run formatted output",
    antlerFormatted,
    "moos",
    "moos"
  );

  const genericallyAlignedAntlerInput = [
    "ProcessConfig = ANTLER",
    "{",
    "  MSBetweenLaunches = 200",
    "",
    "  Run                          = MOOSDB @ NewConsole = false",
    "#ifdef LAUNCH_GUI yes",
    "  Run                          = pMarineViewer @ NewConsole = false",
    "#else",
    "  Run                          = pMissionHash @ NewConsole = false",
    "#endif",
    "",
    "  Run                          = pLogger @ NewConsole = false",
    "  Run                          = uFldShoreBroker @ NewConsole = false",
    "}"
  ].join("\n");

  const genericallyAlignedAntlerExpected = [
    "ProcessConfig = ANTLER",
    "{",
    "  MSBetweenLaunches = 200",
    "",
    "  Run = MOOSDB          @ NewConsole = false",
    "#ifdef LAUNCH_GUI yes",
    "  Run = pMarineViewer   @ NewConsole = false",
    "#else",
    "  Run = pMissionHash    @ NewConsole = false",
    "#endif",
    "",
    "  Run = pLogger         @ NewConsole = false",
    "  Run = uFldShoreBroker @ NewConsole = false",
    "}"
  ].join("\n");

  assertEqual(
    "ANTLER Run formatting repairs generic assignment alignment",
    languageSupport.formatMoosIvpText(genericallyAlignedAntlerInput, "moos").text,
    genericallyAlignedAntlerExpected
  );

  const nonAntlerRunInput = [
    "ProcessConfig = pExample",
    "{",
    "  Run=example",
    "  LongerKey=value",
    "}"
  ].join("\n");

  const nonAntlerRunExpected = [
    "ProcessConfig = pExample",
    "{",
    "  Run       = example",
    "  LongerKey = value",
    "}"
  ].join("\n");

  const nonAntlerRunFormatted = languageSupport.formatMoosIvpText(nonAntlerRunInput, "moos").text;
  assertEqual("non-ANTLER Run formatting", nonAntlerRunFormatted, nonAntlerRunExpected);
  assertClean(
    languageSupport,
    "non-ANTLER Run formatted output",
    nonAntlerRunFormatted,
    "moos",
    "moos"
  );

  const ignoredFormattingDiagnostics = languageSupport.collectFormattingDiagnostics(
    documentFromText([
      "ProcessConfig = pHelmIvP",
      "{",
      "  AppTick=4 // moos-ivp-format-ignore",
      "  CommsTick=4",
      "}"
    ].join("\n"), "moos"),
    "moos"
  );
  assert(
    ignoredFormattingDiagnostics.length === 1,
    "expected ignore marker to suppress only the marked line"
  );
  assert(
    ignoredFormattingDiagnostics[0].range.start.line === 3,
    "expected unmarked formatting diagnostic to remain"
  );

  console.log("formatting fixtures: 9 passed");
}

main();
