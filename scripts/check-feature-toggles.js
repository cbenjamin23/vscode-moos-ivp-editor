const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  FEATURE_TOGGLES,
  configureFeatures,
  registerFeatureToggleCommands
} = require("../src/feature-toggles");

const REPO_ROOT = path.resolve(__dirname, "..");

const settings = {
  "diagnostics.enabled": true,
  "diagnostics.geometry.enabled": true,
  "folding.enabled": true,
  "formatting.diagnostics.enabled": true,
  "hover.enabled": true,
  "semanticHighlighting.enabled": true
};

const providers = {
  codeActions: [],
  commands: [],
  diagnostics: [],
  folding: [],
  formatting: [],
  hover: [],
  semantic: [],
  textChangeListener: undefined
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
  let content = text;
  let lines = content.split(/\r?\n/);
  function setText(nextText) {
    content = nextText;
    lines = content.split(/\r?\n/);
  }
  return {
    uri: `${languageId}-feature-toggle-fixture`,
    languageId,
    setText,
    get lineCount() {
      return lines.length;
    },
    getText() {
      return content;
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
        return content;
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
  commands: {
    registerCommand(command, callback) {
      providers.commands.push({ command, callback });
      return { dispose() {} };
    }
  },
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
    onDidChangeTextDocument(listener) {
      providers.textChangeListener = listener;
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

async function assertFeatureCommand() {
  const commandSettings = {
    "diagnostics.enabled": true,
    "diagnostics.geometry.enabled": false,
    "folding.enabled": true,
    "formatting.diagnostics.enabled": false,
    "hover.enabled": true,
    "semanticHighlighting.enabled": true
  };
  const updates = [];
  const registered = [];

  const commandVscode = {
    ConfigurationTarget: { Global: "global" },
    commands: {
      registerCommand(command, callback) {
        registered.push({ command, callback });
        return { dispose() {} };
      }
    },
    window: {
      async showQuickPick(items, options) {
        assert(options.canPickMany === true, "expected multi-select quick pick");
        assert(items.length === FEATURE_TOGGLES.length, "expected all feature toggles in quick pick");
        const geometryItem = items.find((item) => item.feature.key === "diagnostics.geometry.enabled");
        const formattingItem = items.find((item) => item.feature.key === "formatting.enabled");
        const formattingDiagnosticsItem = items.find((item) => item.feature.key === "formatting.diagnostics.enabled");
        assert(geometryItem && geometryItem.picked === false, "expected geometry diagnostics to start unchecked");
        assert(formattingItem && formattingItem.picked === false, "expected formatting to default unchecked");
        assert(formattingDiagnosticsItem && formattingDiagnosticsItem.picked === false, "expected formatting diagnostics to start unchecked");
        return items.filter((item) => (
          item.feature.key === "diagnostics.enabled"
          || item.feature.key === "formatting.enabled"
          || item.feature.key === "hover.enabled"
        ));
      },
      showInformationMessage() {}
    },
    workspace: {
      getConfiguration(section) {
        assert(section === "moosIvpEditor", "expected MOOS-IvP configuration section");
        return {
          get(name, fallback) {
            return Object.prototype.hasOwnProperty.call(commandSettings, name)
              ? commandSettings[name]
              : fallback;
          },
          update(name, value, target) {
            updates.push({ name, value, target });
            commandSettings[name] = value;
            return Promise.resolve();
          }
        };
      }
    }
  };

  const context = { subscriptions: [] };
  registerFeatureToggleCommands(commandVscode, context);
  assert(registered.length === 1, "expected configure command registration");
  assert(registered[0].command === "moosIvpEditor.configureFeatures", "expected configure command id");

  await configureFeatures(commandVscode);
  assert(updates.length === FEATURE_TOGGLES.length, "expected one update per feature");
  assert(commandSettings["diagnostics.enabled"] === true, "expected diagnostics enabled by command");
  assert(commandSettings["formatting.enabled"] === true, "expected formatting enabled by command");
  assert(commandSettings["hover.enabled"] === true, "expected hover enabled by command");
  assert(commandSettings["folding.enabled"] === false, "expected unselected folding to be disabled");
  assert(commandSettings["semanticHighlighting.enabled"] === false, "expected unselected semantic highlighting to be disabled");
  assert(updates.every((update) => update.target === commandVscode.ConfigurationTarget.Global), "expected global setting updates");
}

async function main() {
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

  settings["diagnostics.enabled"] = false;
  settings["formatting.enabled"] = true;
  settings["formatting.diagnostics.enabled"] = true;
  providers.diagnostics.length = 0;
  providers.configurationListener({ affectsConfiguration: (name) => name === "moosIvpEditor" });
  const formattingDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  const appTickDiagnostics = formattingDiagnostics.filter((diagnostic) => (
    diagnostic.range.start.line === 3
  ));
  assert(appTickDiagnostics.length > 0, "expected AppTick formatting diagnostic before temporary ignore");
  const formattingActions = codeActionProvider.provideCodeActions(docs[0], undefined, {
    diagnostics: formattingDiagnostics
  });
  const ignoreAction = formattingActions.find((action) => (
    action.command && action.command.command === "moosIvpEditor.ignoreFormattingLine"
  ));
  assert(ignoreAction, "expected temporary formatting ignore quick fix");
  const ignoreCommand = providers.commands.find((item) => item.command === "moosIvpEditor.ignoreFormattingLine");
  assert(ignoreCommand, "expected temporary formatting ignore command registration");
  ignoreCommand.callback(...ignoreAction.command.arguments);
  const ignoredDiagnostics = providers.diagnostics[providers.diagnostics.length - 1].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  assert(
    ignoredDiagnostics.every((diagnostic) => diagnostic.range.start.line !== 3),
    "expected temporary ignore to suppress the selected line"
  );
  providers.diagnostics.length = 0;
  providers.configurationListener({ affectsConfiguration: (name) => name === "moosIvpEditor" });
  const persistedDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  assert(
    persistedDiagnostics.every((diagnostic) => diagnostic.range.start.line !== 3),
    "expected temporary ignore to persist across diagnostic refreshes"
  );
  providers.diagnostics.length = 0;
  providers.textChangeListener({ document: docs[0], contentChanges: [] });
  const emptyChangeDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  assert(
    emptyChangeDiagnostics.every((diagnostic) => diagnostic.range.start.line !== 3),
    "expected empty document change events to preserve temporary formatting ignores"
  );

  docs[0].setText([
    "ProcessConfig = pContactMgrV20",
    "{",
    "  match_region = pts={0,0:100,100:0,100:100,0}",
    "  inserted = true",
    "  AppTick=4",
    "}"
  ].join("\n"));
  providers.diagnostics.length = 0;
  providers.textChangeListener({ document: docs[0], contentChanges: [{ text: "x" }] });
  const afterShiftDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  assert(
    afterShiftDiagnostics.every((diagnostic) => diagnostic.range.start.line !== 4),
    "expected temporary ignore to follow an unchanged line when it moves"
  );

  docs[0].setText([
    "ProcessConfig = pContactMgrV20",
    "{",
    "  match_region = pts={0,0:100,100:0,100:100,0}",
    "  inserted = true",
    "  AppTick=5",
    "}"
  ].join("\n"));
  providers.diagnostics.length = 0;
  providers.textChangeListener({ document: docs[0], contentChanges: [{ text: "x" }] });
  const afterEditDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  assert(
    afterEditDiagnostics.some((diagnostic) => diagnostic.range.start.line === 4),
    "expected edits to the ignored line to clear its temporary ignore"
  );

  const duplicateDoc = documentFromText([
    "ProcessConfig = pContactMgrV20",
    "{",
    "  AppTick=4",
    "  CommsTick=4",
    "  AppTick=4",
    "}"
  ].join("\n"), "moos");
  duplicateDoc.uri = "moos-duplicate-feature-toggle-fixture";
  vscode.workspace.textDocuments.push(duplicateDoc);
  providers.diagnostics.length = 0;
  providers.textChangeListener({ document: duplicateDoc, contentChanges: [{ text: "open" }] });
  const duplicateInitialDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  const duplicateActions = codeActionProvider.provideCodeActions(duplicateDoc, undefined, {
    diagnostics: duplicateInitialDiagnostics.filter((diagnostic) => diagnostic.range.start.line === 4)
  });
  const duplicateIgnoreAction = duplicateActions.find((action) => (
    action.command && action.command.command === "moosIvpEditor.ignoreFormattingLine"
  ));
  assert(duplicateIgnoreAction, "expected duplicate-line temporary ignore quick fix");
  ignoreCommand.callback(...duplicateIgnoreAction.command.arguments);
  duplicateDoc.setText([
    "ProcessConfig = pContactMgrV20",
    "{",
    "  AppTick=4",
    "  CommsTick=4",
    "  inserted = true",
    "  AppTick=4",
    "}"
  ].join("\n"));
  providers.diagnostics.length = 0;
  providers.textChangeListener({ document: duplicateDoc, contentChanges: [{ text: "x" }] });
  const duplicateShiftDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  assert(
    duplicateShiftDiagnostics.some((diagnostic) => diagnostic.range.start.line === 2),
    "expected earlier duplicate formatting line to remain diagnosed"
  );
  assert(
    duplicateShiftDiagnostics.every((diagnostic) => diagnostic.range.start.line !== 5),
    "expected temporary ignore to follow the nearest matching duplicate line"
  );

  const multiIgnoreDoc = documentFromText([
    "ProcessConfig = pContactMgrV20",
    "{",
    "  AppTick=4",
    "  CommsTick=4",
    "}"
  ].join("\n"), "moos");
  multiIgnoreDoc.uri = "moos-multi-ignore-feature-toggle-fixture";
  vscode.workspace.textDocuments.push(multiIgnoreDoc);
  providers.diagnostics.length = 0;
  providers.textChangeListener({ document: multiIgnoreDoc, contentChanges: [{ text: "open" }] });
  const multiDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  multiDiagnostics.forEach((diagnostic) => {
    const action = codeActionProvider.provideCodeActions(multiIgnoreDoc, undefined, {
      diagnostics: [diagnostic]
    }).find((candidate) => (
      candidate.command && candidate.command.command === "moosIvpEditor.ignoreFormattingLine"
    ));
    assert(action, "expected temporary ignore action for each formatting diagnostic");
    ignoreCommand.callback(...action.command.arguments);
  });
  multiIgnoreDoc.setText([
    "ProcessConfig = pContactMgrV20",
    "{",
    "  inserted = true",
    "  AppTick=4",
    "  CommsTick=4",
    "}"
  ].join("\n"));
  providers.diagnostics.length = 0;
  providers.textChangeListener({ document: multiIgnoreDoc, contentChanges: [{ text: "x" }] });
  const multiShiftDiagnostics = providers.diagnostics[0].diagnostics.filter((diagnostic) => (
    diagnostic.source === "MOOS-IvP Format"
  ));
  assert(
    multiShiftDiagnostics.every((diagnostic) => diagnostic.range.start.line !== 3 && diagnostic.range.start.line !== 4),
    "expected multiple temporary ignores to follow their moved lines independently"
  );

  settings["hover.enabled"] = false;
  const hoverProvider = providers.hover.find((item) => item.language === "moos").provider;
  assert(hoverProvider.provideHover(docs[0], { line: 0, character: 20 }) === undefined, "expected hover toggle to suppress hover results");

  const behaviorSemanticProvider = providers.semantic.find((item) => item.language === "ivp-behavior").provider;
  const unknownBehaviorTokens = behaviorSemanticProvider.provideDocumentSemanticTokens(documentFromText([
    "Behavior = BHV_CustomLocal",
    "{",
    "  name = local_custom",
    "  custom_param = true",
    "}"
  ].join("\n"), "ivp-behavior")).tokens;
  assert(
    !unknownBehaviorTokens.some((token) => token.type === "class" && token.range.start.line === 0),
    "expected unknown behavior owner to remain neutral"
  );
  assert(
    unknownBehaviorTokens.some((token) => token.type === "property" && token.range.start.line === 2),
    "expected inherited behavior parameters to stay highlighted in unknown behavior blocks"
  );
  assert(
    !unknownBehaviorTokens.some((token) => token.type === "property" && token.range.start.line === 3),
    "expected unknown behavior-specific parameters to remain neutral"
  );

  settings["semanticHighlighting.enabled"] = false;
  const semanticProvider = providers.semantic.find((item) => item.language === "moos").provider;
  assert(semanticProvider.provideDocumentSemanticTokens(docs[0]).tokens.length === 0, "expected semantic toggle to suppress semantic tokens");

  await assertFeatureCommand();

  console.log("feature toggle fixtures: passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
