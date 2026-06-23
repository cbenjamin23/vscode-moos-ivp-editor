const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO_ROOT = path.resolve(__dirname, "..");

const settings = {
  "diagnostics.enabled": true,
  "diagnostics.geometry.enabled": true,
  "folding.enabled": true,
  "formatting.enabled": true,
  "formatting.diagnostics.enabled": true,
  "hover.enabled": true,
  "semanticHighlighting.enabled": true
};

const providers = {
  codeActions: [],
  diagnostics: [],
  folding: [],
  formatting: [],
  hover: [],
  semantic: []
};

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

class FoldingRange {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

class MarkdownString {
  constructor() {
    this.value = "";
  }

  appendMarkdown(text) {
    this.value += text;
  }
}

class Hover {
  constructor(contents, range) {
    this.contents = contents;
    this.range = range;
  }
}

class SemanticTokensBuilder {
  constructor() {
    this.tokens = [];
  }

  push(range, type, modifiers) {
    this.tokens.push({ range, type, modifiers });
  }

  build() {
    return { tokens: this.tokens };
  }
}

class SemanticTokensLegend {
  constructor(types, modifiers) {
    this.types = types;
    this.modifiers = modifiers;
  }
}

class CodeAction {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
  }
}

class WorkspaceEdit {
  replace(uri, range, text) {
    this.replacement = { uri, range, text };
  }
}

function documentFromText(text, languageId) {
  const lines = text.split(/\r?\n/);
  return {
    uri: `${languageId}-feature-toggle-fixture`,
    languageId,
    lineCount: lines.length,
    getText() {
      return text;
    },
    getWordRangeAtPosition(position, pattern) {
      const line = lines[position.line] || "";
      for (const match of line.matchAll(new RegExp(pattern.source, "g"))) {
        const start = match.index;
        const end = start + match[0].length;
        if (position.character >= start && position.character <= end) {
          return new Range(position.line, start, position.line, end);
        }
      }
      return undefined;
    },
    getText(range) {
      if (!range) {
        return text;
      }
      const line = lines[range.start.line] || "";
      return line.slice(range.start.character, range.end.character);
    },
    lineAt(lineNumber) {
      return { text: lines[lineNumber] || "" };
    }
  };
}

const docs = [
  documentFromText([
    "ProcessConfig = pContactMgrV20",
    "{",
    "  match_region = pts={0,0:100,100:0,100:100,0}",
    "  AppTick=4",
    "}"
  ].join("\n"), "moos")
];

const vscode = {
  CodeAction,
  CodeActionKind: { QuickFix: "quickfix" },
  Diagnostic,
  DiagnosticSeverity: { Warning: 1 },
  FoldingRange,
  Hover,
  MarkdownString,
  Range,
  SemanticTokensBuilder,
  SemanticTokensLegend,
  TextEdit: {
    replace(range, text) {
      return { range, text };
    }
  },
  WorkspaceEdit,
  languages: {
    createDiagnosticCollection() {
      return {
        delete() {},
        set(uri, diagnostics) {
          providers.diagnostics.push({ uri, diagnostics });
        }
      };
    },
    registerCodeActionsProvider(language, provider) {
      providers.codeActions.push({ language, provider });
      return { dispose() {} };
    },
    registerDocumentFormattingEditProvider(language, provider) {
      providers.formatting.push({ language, provider });
      return { dispose() {} };
    },
    registerDocumentSemanticTokensProvider(language, provider) {
      providers.semantic.push({ language, provider });
      return { dispose() {} };
    },
    registerFoldingRangeProvider(language, provider) {
      providers.folding.push({ language, provider });
      return { dispose() {} };
    },
    registerHoverProvider(language, provider) {
      providers.hover.push({ language, provider });
      return { dispose() {} };
    }
  },
  workspace: {
    textDocuments: docs,
    getConfiguration(section) {
      return {
        get(name, fallback) {
          if (section === "moosIvpEditor.formatting" && name === "indentSize") {
            return 2;
          }
          return Object.prototype.hasOwnProperty.call(settings, name)
            ? settings[name]
            : fallback;
        }
      };
    },
    onDidChangeConfiguration(listener) {
      providers.configurationListener = listener;
      return { dispose() {} };
    },
    onDidChangeTextDocument() {
      return { dispose() {} };
    },
    onDidCloseTextDocument() {
      return { dispose() {} };
    },
    onDidOpenTextDocument() {
      return { dispose() {} };
    }
  }
};

function loadLanguageSupport() {
  const code = fs.readFileSync(path.join(REPO_ROOT, "src", "language-support.js"), "utf8");
  const context = {
    require(name) {
      if (name === "vscode") {
        return vscode;
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const languageSupport = loadLanguageSupport();
  const context = {
    extensionPath: REPO_ROOT,
    subscriptions: []
  };
  languageSupport.registerLanguageSupport(context);

  assert(providers.diagnostics[0].diagnostics.length > 0, "expected diagnostics to be enabled by default");
  settings["diagnostics.geometry.enabled"] = false;
  providers.diagnostics.length = 0;
  providers.configurationListener({ affectsConfiguration: (name) => name === "moosIvpEditor" });
  assert(providers.diagnostics[0].diagnostics.every((diagnostic) => (
    !diagnostic.message.includes("self-intersecting")
  )), "expected geometry diagnostics to be suppressible");

  settings["diagnostics.enabled"] = false;
  settings["formatting.diagnostics.enabled"] = false;
  providers.diagnostics.length = 0;
  providers.configurationListener({ affectsConfiguration: (name) => name === "moosIvpEditor" });
  assert(providers.diagnostics[0].diagnostics.length === 0, "expected diagnostics to be suppressible");

  settings["folding.enabled"] = false;
  const foldingProvider = providers.folding.find((item) => item.language === "moos").provider;
  assert(foldingProvider.provideFoldingRanges(docs[0]).length === 0, "expected folding toggle to suppress ranges");

  settings["formatting.enabled"] = false;
  const formattingProvider = providers.formatting.find((item) => item.language === "moos").provider;
  assert(formattingProvider.provideDocumentFormattingEdits(docs[0]).length === 0, "expected formatting toggle to suppress edits");

  const codeActionProvider = providers.codeActions.find((item) => item.language === "moos").provider;
  assert(codeActionProvider.provideCodeActions(docs[0], undefined, { diagnostics: [{ source: "MOOS-IvP Format" }] }).length === 0, "expected formatting toggle to suppress quick fixes");

  settings["hover.enabled"] = false;
  const hoverProvider = providers.hover.find((item) => item.language === "moos").provider;
  assert(hoverProvider.provideHover(docs[0], { line: 0, character: 20 }) === undefined, "expected hover toggle to suppress hover results");

  settings["semanticHighlighting.enabled"] = false;
  const semanticProvider = providers.semantic.find((item) => item.language === "moos").provider;
  assert(semanticProvider.provideDocumentSemanticTokens(docs[0]).tokens.length === 0, "expected semantic toggle to suppress semantic tokens");

  console.log("feature toggle fixtures: passed");
}

main();
