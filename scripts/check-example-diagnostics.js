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

function documentFromFile(relativePath) {
  const filePath = path.join(REPO_ROOT, relativePath);
  const lines = fs.readFileSync(filePath, "utf8").split(/\n/);
  return {
    uri: filePath,
    lineCount: lines.length,
    lineAt(lineNumber) {
      return { text: lines[lineNumber] || "" };
    }
  };
}

function reportDiagnostics(relativePath, diagnostics) {
  if (!diagnostics.length) {
    console.log(`${relativePath}: 0 diagnostics`);
    return;
  }

  console.log(`${relativePath}: ${diagnostics.length} diagnostics`);
  diagnostics.slice(0, 40).forEach((diagnostic) => {
    const line = diagnostic.range.start.line + 1;
    const column = diagnostic.range.start.character + 1;
    console.log(`  ${line}:${column} ${diagnostic.message}`);
  });
  if (diagnostics.length > 40) {
    console.log(`  ... ${diagnostics.length - 40} more`);
  }
}

function main() {
  const languageSupport = loadLanguageSupport();
  const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "data", "diagnostic-schema.json"), "utf8"));
  const checks = [
    ["examples/all_apps.moos", languageSupport.collectMoosDiagnostics],
    ["examples/all_behaviors.bhv", languageSupport.collectBehaviorDiagnostics]
  ];

  let total = 0;
  checks.forEach(([relativePath, collect]) => {
    const diagnostics = collect(documentFromFile(relativePath), schema);
    total += diagnostics.length;
    reportDiagnostics(relativePath, diagnostics);
  });

  if (total > 0) {
    process.exitCode = 1;
  }
}

main();
