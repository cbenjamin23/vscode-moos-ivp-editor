const path = require("path");
const vscode = require("vscode");
const {
  findCurrentOwner
} = require(path.join(__dirname, "scanner"));
const {
  defaultFormattingOptions,
  documentText,
  formatDocument,
  formatMoosIvpText
} = require(path.join(__dirname, "formatter"));
const {
  isConvexPointList,
  parseSimpleGeometryPoints,
  validateGeometryValue
} = require(path.join(__dirname, "geometry"));
const {
  validateSchemaValue
} = require(path.join(__dirname, "validators"));
const {
  collectConfigDiagnosticRecords
} = require(path.join(__dirname, "diagnostics"));
const {
  buildDocLookup,
  buildInventoryLookup,
  buildLookup,
  buildSourceLookup,
  keyFor,
  loadLanguageRegistry,
  mergeLookups,
  normalizedName
} = require(path.join(__dirname, "registry"));
const {
  blockParameterLookup,
  createHoverProvider: createVscodeHoverProvider,
} = require(path.join(__dirname, "hover"));
const {
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  createSemanticTokensProvider: createVscodeSemanticTokensProvider
} = require(path.join(__dirname, "semantic-tokens"));
const {
  createFoldingRangeProvider: createVscodeFoldingRangeProvider
} = require(path.join(__dirname, "folding"));

function extensionConfiguration() {
  return vscode.workspace && vscode.workspace.getConfiguration
    ? vscode.workspace.getConfiguration("moosIvpEditor")
    : undefined;
}

function extensionSetting(name, defaultValue = true) {
  const config = extensionConfiguration();
  return config && config.get ? config.get(name, defaultValue) : defaultValue;
}

function diagnosticsEnabled() {
  return extensionSetting("diagnostics.enabled", true);
}

function geometryDiagnosticsEnabled() {
  return extensionSetting("diagnostics.geometry.enabled", true);
}

function foldingEnabled() {
  return extensionSetting("folding.enabled", true);
}

function formattingEnabled() {
  return extensionSetting("formatting.enabled", false);
}

function formattingDiagnosticsEnabled() {
  return extensionSetting("formatting.diagnostics.enabled", true);
}

function hoverEnabled() {
  return extensionSetting("hover.enabled", true);
}

function semanticHighlightingEnabled() {
  return extensionSetting("semanticHighlighting.enabled", true);
}

function createFoldingRangeProvider(language) {
  const provider = createVscodeFoldingRangeProvider(vscode, language);
  return {
    provideFoldingRanges(document, context, token) {
      return foldingEnabled()
        ? provider.provideFoldingRanges(document, context, token)
        : [];
    }
  };
}

function createSemanticTokensProvider(language, docLookup, sourceLookup, inventoryLookup, semanticTokenLegend) {
  const provider = createVscodeSemanticTokensProvider(vscode, language, docLookup, sourceLookup, inventoryLookup, semanticTokenLegend);
  return {
    provideDocumentSemanticTokens(document, token) {
      if (!semanticHighlightingEnabled()) {
        return new vscode.SemanticTokensBuilder(semanticTokenLegend).build();
      }
      return provider.provideDocumentSemanticTokens(document, token);
    }
  };
}

function createHoverProvider(language, lookup, docLookup, sourceLookup, diagnosticSchema) {
  const provider = createVscodeHoverProvider(vscode, language, lookup, docLookup, sourceLookup, diagnosticSchema);
  return {
    provideHover(document, position, token) {
      return hoverEnabled()
        ? provider.provideHover(document, position, token)
        : undefined;
    }
  };
}

function createDiagnostic(document, lineNumber, valueStart, valueText, message) {
  const valueEnd = Math.max(valueStart + valueText.length, valueStart + 1);
  const range = new vscode.Range(lineNumber, valueStart, lineNumber, valueEnd);
  const diagnostic = new vscode.Diagnostic(
    range,
    message,
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = "MOOS-IvP";
  return diagnostic;
}

function fullDocumentRange(document) {
  if (document.lineCount === 0) {
    return new vscode.Range(0, 0, 0, 0);
  }

  const lastLine = Math.max(0, document.lineCount - 1);
  const lastText = document.lineAt(lastLine).text || "";
  return new vscode.Range(0, 0, lastLine, lastText.length);
}

function createFormattingDiagnostic(document, issue) {
  const line = Math.min(issue.lineNumber, Math.max(0, document.lineCount - 1));
  const lineText = document.lineAt(line).text || "";
  const range = new vscode.Range(line, 0, line, Math.max(1, lineText.length));
  const diagnostic = new vscode.Diagnostic(
    range,
    issue.message,
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = "MOOS-IvP Format";
  diagnostic.code = issue.code;
  return diagnostic;
}

const temporaryFormattingIgnores = new Map();

function documentKey(uri) {
  return uri && typeof uri.toString === "function" ? uri.toString() : String(uri);
}

function documentLineText(document, lineNumber) {
  if (lineNumber < 0 || lineNumber >= document.lineCount) {
    return undefined;
  }
  return document.lineAt(lineNumber).text || "";
}

function temporaryFormattingIgnoreRecords(document) {
  const key = documentKey(document.uri);
  if (!temporaryFormattingIgnores.has(key)) {
    temporaryFormattingIgnores.set(key, []);
  }
  return temporaryFormattingIgnores.get(key);
}

function addTemporaryFormattingIgnore(document, lineNumber) {
  const text = documentLineText(document, lineNumber);
  if (text === undefined) {
    return;
  }

  const records = temporaryFormattingIgnoreRecords(document);
  if (!records.some((record) => record.lineNumber === lineNumber && record.text === text)) {
    records.push({ lineNumber, text });
  }
}

function clearTemporaryFormattingIgnores(document) {
  temporaryFormattingIgnores.delete(documentKey(document.uri));
}

function isTemporarilyIgnoredFormattingIssue(document, issue) {
  const records = temporaryFormattingIgnores.get(documentKey(document.uri));
  if (!records) {
    return false;
  }

  const text = documentLineText(document, issue.lineNumber);
  return records.some((record) => record.lineNumber === issue.lineNumber && record.text === text);
}

function closestMatchingLine(document, record, usedLines) {
  let matchedLine = -1;
  let matchedDistance = Number.POSITIVE_INFINITY;
  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    if (usedLines.has(lineNumber) || documentLineText(document, lineNumber) !== record.text) {
      continue;
    }

    const distance = Math.abs(lineNumber - record.lineNumber);
    if (distance < matchedDistance) {
      matchedLine = lineNumber;
      matchedDistance = distance;
    }
  }
  return matchedLine;
}

function remapTemporaryFormattingIgnores(document) {
  const records = temporaryFormattingIgnores.get(documentKey(document.uri));
  if (!records || records.length === 0) {
    return;
  }

  const usedLines = new Set();
  const remapped = [];
  records.forEach((record) => {
    if (documentLineText(document, record.lineNumber) === record.text) {
      usedLines.add(record.lineNumber);
      remapped.push(record);
      return;
    }

    const matchedLine = closestMatchingLine(document, record, usedLines);

    if (matchedLine !== -1) {
      usedLines.add(matchedLine);
      remapped.push({ lineNumber: matchedLine, text: record.text });
    }
  });

  if (remapped.length === 0) {
    clearTemporaryFormattingIgnores(document);
    return;
  }

  temporaryFormattingIgnores.set(documentKey(document.uri), remapped);
}

function suppressesFormattingDiagnostic(document, issue) {
  const line = Math.min(issue.lineNumber, Math.max(0, document.lineCount - 1));
  const lineText = document.lineAt(line).text || "";
  return /\bmoos-ivp-format-ignore\b/.test(lineText)
    || isTemporarilyIgnoredFormattingIssue(document, issue);
}

function collectFormattingDiagnostics(document, language, options = {}) {
  return formatDocument(document, language, options).issues
    .filter((issue) => !suppressesFormattingDiagnostic(document, issue))
    .map((issue) => (
      createFormattingDiagnostic(document, issue)
    ));
}

function collectConfigDiagnostics(document, diagnosticSchema, language, options = {}) {
  return collectConfigDiagnosticRecords(document, diagnosticSchema, language, options)
    .map((record) => createDiagnostic(
      document,
      record.lineNumber,
      record.valueStart,
      record.valueText,
      record.message
    ));
}

function collectBehaviorDiagnostics(document, diagnosticSchema) {
  return collectConfigDiagnostics(document, diagnosticSchema, "ivp-behavior");
}

function collectMoosDiagnostics(document, diagnosticSchema) {
  return collectConfigDiagnostics(document, diagnosticSchema, "moos");
}

function workspaceFormattingOptions() {
  if (!vscode.workspace || !vscode.workspace.getConfiguration) {
    return defaultFormattingOptions();
  }

  const config = vscode.workspace.getConfiguration("moosIvpEditor.formatting");
  return defaultFormattingOptions({
    indentSize: config.get("indentSize", 2)
  });
}

function diagnosticsForDocument(document, diagnosticSchema, language) {
  const diagnostics = diagnosticsEnabled()
    ? collectConfigDiagnostics(document, diagnosticSchema, language, {
      geometryEnabled: geometryDiagnosticsEnabled()
    })
    : [];
  if (formattingEnabled() && formattingDiagnosticsEnabled()) {
    diagnostics.push(...collectFormattingDiagnostics(document, language, workspaceFormattingOptions()));
  }
  return diagnostics;
}

function refreshDiagnostics(document, collection, diagnosticSchema) {
  if (document.languageId === "ivp-behavior") {
    collection.set(document.uri, diagnosticsForDocument(document, diagnosticSchema, "ivp-behavior"));
    return;
  }

  if (document.languageId === "moos") {
    collection.set(document.uri, diagnosticsForDocument(document, diagnosticSchema, "moos"));
    return;
  }

  collection.delete(document.uri);
}

function documentMatchesUri(document, uri) {
  return documentKey(document.uri) === documentKey(uri);
}

function hasDocumentContentChanges(event) {
  return Array.isArray(event.contentChanges) && event.contentChanges.length > 0;
}

function registerDiagnostics(context, diagnosticSchema) {
  const collection = vscode.languages.createDiagnosticCollection("moos-ivp");
  context.subscriptions.push(collection);

  for (const document of vscode.workspace.textDocuments) {
    refreshDiagnostics(document, collection, diagnosticSchema);
  }

  context.subscriptions.push(
    vscode.commands && vscode.commands.registerCommand
      ? vscode.commands.registerCommand("moosIvpEditor.ignoreFormattingLine", (uri, lineNumber) => {
        const document = (vscode.workspace.textDocuments || []).find((item) => (
          documentMatchesUri(item, uri)
        ));
        if (!document || !Number.isInteger(lineNumber)) {
          return;
        }
        addTemporaryFormattingIgnore(document, lineNumber);
        refreshDiagnostics(document, collection, diagnosticSchema);
      })
      : { dispose() {} },
    vscode.workspace.onDidOpenTextDocument((document) => {
      refreshDiagnostics(document, collection, diagnosticSchema);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (hasDocumentContentChanges(event)) {
        remapTemporaryFormattingIgnores(event.document);
      }
      refreshDiagnostics(event.document, collection, diagnosticSchema);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration && !event.affectsConfiguration("moosIvpEditor")) {
        return;
      }
      for (const document of vscode.workspace.textDocuments) {
        refreshDiagnostics(document, collection, diagnosticSchema);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearTemporaryFormattingIgnores(document);
      collection.delete(document.uri);
    })
  );
}

function createDocumentFormattingProvider(language) {
  return {
    provideDocumentFormattingEdits(document) {
      if (!formattingEnabled()) {
        return [];
      }

      const original = documentText(document);
      const formatted = formatMoosIvpText(original, language, workspaceFormattingOptions()).text;
      if (formatted === original) {
        return [];
      }
      return [
        vscode.TextEdit.replace(fullDocumentRange(document), formatted)
      ];
    }
  };
}

function createFormattingCodeActionProvider(language) {
  return {
    provideCodeActions(document, range, context) {
      if (!formattingEnabled() || !formattingDiagnosticsEnabled()) {
        return [];
      }

      const formattingDiagnostics = (context.diagnostics || []).filter((diagnostic) => (
        diagnostic.source === "MOOS-IvP Format"
      ));
      if (!formattingDiagnostics.length) {
        return [];
      }

      const actions = [];
      const ignoredLines = new Set();
      formattingDiagnostics.forEach((diagnostic) => {
        const line = diagnostic.range && diagnostic.range.start
          ? diagnostic.range.start.line
          : undefined;
        if (!Number.isInteger(line) || ignoredLines.has(line)) {
          return;
        }
        ignoredLines.add(line);
        const ignoreAction = new vscode.CodeAction(
          "Ignore MOOS-IvP formatting on this line",
          vscode.CodeActionKind.QuickFix
        );
        ignoreAction.diagnostics = formattingDiagnostics.filter((item) => (
          item.range && item.range.start && item.range.start.line === line
        ));
        ignoreAction.command = {
          command: "moosIvpEditor.ignoreFormattingLine",
          title: "Ignore MOOS-IvP formatting on this line",
          arguments: [document.uri, line]
        };
        actions.push(ignoreAction);
      });

      const original = documentText(document);
      const formatted = formatMoosIvpText(original, language, workspaceFormattingOptions()).text;
      if (formatted === original) {
        return actions;
      }

      const action = new vscode.CodeAction(
        "Format MOOS-IvP document",
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = formattingDiagnostics;
      action.isPreferred = true;
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, fullDocumentRange(document), formatted);
      return [action, ...actions];
    }
  };
}

function registerLanguageSupport(context) {
  const {
    moosLookup,
    bhvLookup,
    moosDocLookup,
    bhvDocLookup,
    moosSourceLookup,
    bhvSourceLookup,
    diagnosticSchema
  } = loadLanguageRegistry(context);

  const subscriptions = [
    vscode.languages.registerHoverProvider("moos", createHoverProvider("moos", moosLookup, moosDocLookup, moosSourceLookup, diagnosticSchema)),
    vscode.languages.registerHoverProvider("ivp-behavior", createHoverProvider("ivp-behavior", bhvLookup, bhvDocLookup, bhvSourceLookup, diagnosticSchema))
  ];

  if (vscode.languages.registerFoldingRangeProvider) {
    subscriptions.push(
      vscode.languages.registerFoldingRangeProvider("moos", createFoldingRangeProvider("moos")),
      vscode.languages.registerFoldingRangeProvider("ivp-behavior", createFoldingRangeProvider("ivp-behavior"))
    );
  }

  if (vscode.languages.registerDocumentFormattingEditProvider && vscode.TextEdit) {
    subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider("moos", createDocumentFormattingProvider("moos")),
      vscode.languages.registerDocumentFormattingEditProvider("ivp-behavior", createDocumentFormattingProvider("ivp-behavior"))
    );
  }

  if (
    vscode.languages.registerCodeActionsProvider
    && vscode.CodeAction
    && vscode.CodeActionKind
    && vscode.WorkspaceEdit
  ) {
    subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        "moos",
        createFormattingCodeActionProvider("moos"),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
      ),
      vscode.languages.registerCodeActionsProvider(
        "ivp-behavior",
        createFormattingCodeActionProvider("ivp-behavior"),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
      )
    );
  }

  if (
    vscode.languages.registerDocumentSemanticTokensProvider
    && vscode.SemanticTokensBuilder
    && vscode.SemanticTokensLegend
  ) {
    const semanticTokenLegend = new vscode.SemanticTokensLegend(
      SEMANTIC_TOKEN_TYPES,
      SEMANTIC_TOKEN_MODIFIERS
    );
    subscriptions.push(
      vscode.languages.registerDocumentSemanticTokensProvider(
        "moos",
        createSemanticTokensProvider("moos", moosDocLookup, moosSourceLookup, moosLookup, semanticTokenLegend),
        semanticTokenLegend
      ),
      vscode.languages.registerDocumentSemanticTokensProvider(
        "ivp-behavior",
        createSemanticTokensProvider("ivp-behavior", bhvDocLookup, bhvSourceLookup, bhvLookup, semanticTokenLegend),
        semanticTokenLegend
      )
    );
  }

  context.subscriptions.push(...subscriptions);
  registerDiagnostics(context, diagnosticSchema);
}

module.exports = {
  registerLanguageSupport,
  buildLookup,
  mergeLookups,
  buildInventoryLookup,
  buildDocLookup,
  buildSourceLookup,
  createHoverProvider,
  createSemanticTokensProvider,
  formatMoosIvpText,
  collectFormattingDiagnostics,
  collectMoosDiagnostics,
  collectBehaviorDiagnostics,
  validateSchemaValue,
  validateGeometryValue,
  parseSimpleGeometryPoints,
  isConvexPointList,
  findCurrentOwner,
  blockParameterLookup
};
