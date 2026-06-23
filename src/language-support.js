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

function createFoldingRangeProvider(language) {
  return createVscodeFoldingRangeProvider(vscode, language);
}

function createSemanticTokensProvider(language, docLookup, sourceLookup, inventoryLookup, semanticTokenLegend) {
  return createVscodeSemanticTokensProvider(vscode, language, docLookup, sourceLookup, inventoryLookup, semanticTokenLegend);
}

function createHoverProvider(language, lookup, docLookup, sourceLookup, diagnosticSchema) {
  return createVscodeHoverProvider(vscode, language, lookup, docLookup, sourceLookup, diagnosticSchema);
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

function collectFormattingDiagnostics(document, language, options = {}) {
  return formatDocument(document, language, options).issues.map((issue) => (
    createFormattingDiagnostic(document, issue)
  ));
}

function collectConfigDiagnostics(document, diagnosticSchema, language) {
  return collectConfigDiagnosticRecords(document, diagnosticSchema, language)
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

function formattingDiagnosticsEnabled() {
  if (!vscode.workspace || !vscode.workspace.getConfiguration) {
    return true;
  }

  return vscode.workspace
    .getConfiguration("moosIvpEditor.formatting")
    .get("diagnostics.enabled", true);
}

function diagnosticsForDocument(document, diagnosticSchema, language) {
  const diagnostics = collectConfigDiagnostics(document, diagnosticSchema, language);
  if (formattingDiagnosticsEnabled()) {
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

function registerDiagnostics(context, diagnosticSchema) {
  const collection = vscode.languages.createDiagnosticCollection("moos-ivp");
  context.subscriptions.push(collection);

  for (const document of vscode.workspace.textDocuments) {
    refreshDiagnostics(document, collection, diagnosticSchema);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      refreshDiagnostics(document, collection, diagnosticSchema);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      refreshDiagnostics(event.document, collection, diagnosticSchema);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration && !event.affectsConfiguration("moosIvpEditor.formatting")) {
        return;
      }
      for (const document of vscode.workspace.textDocuments) {
        refreshDiagnostics(document, collection, diagnosticSchema);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
    })
  );
}

function createDocumentFormattingProvider(language) {
  return {
    provideDocumentFormattingEdits(document) {
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
      const formattingDiagnostics = (context.diagnostics || []).filter((diagnostic) => (
        diagnostic.source === "MOOS-IvP Format"
      ));
      if (!formattingDiagnostics.length) {
        return [];
      }

      const original = documentText(document);
      const formatted = formatMoosIvpText(original, language, workspaceFormattingOptions()).text;
      if (formatted === original) {
        return [];
      }

      const action = new vscode.CodeAction(
        "Format MOOS-IvP document",
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = formattingDiagnostics;
      action.isPreferred = true;
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, fullDocumentRange(document), formatted);
      return [action];
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
