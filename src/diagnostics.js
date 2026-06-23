const {
  parameterLookupName,
  stripInlineComment,
  createBlockState,
  applyBlockState
} = require("./scanner");
const {
  diagnosticMessage,
  validateSchemaValue
} = require("./validators");

function normalizedName(name) {
  return name.toLowerCase().replace(/-/g, "_");
}

function schemaParameterEntry(container, word) {
  if (!container) {
    return undefined;
  }

  const parameters = container.parameters || container;
  const baseWord = parameterLookupName(word);
  return parameters[word]
    || parameters[baseWord]
    || parameters[baseWord.toLowerCase()]
    || parameters[normalizedName(baseWord)];
}

function ownerVariants(owner, language) {
  if (!owner || language !== "ivp-behavior") {
    return [owner];
  }

  const variants = [owner];
  if (owner.startsWith("BHV_")) {
    variants.push(owner.slice(4));
  } else {
    variants.push(`BHV_${owner}`);
  }
  return [...new Set(variants)];
}

function diagnosticSchemaEntry(owner, word, language, schema) {
  if (!owner || !schema) {
    return undefined;
  }

  if (language === "moos") {
    for (const variant of ownerVariants(owner, language)) {
      const item = schema.apps && schema.apps[variant];
      const entry = schemaParameterEntry(item, word);
      if (entry) {
        return entry;
      }
    }

    return schemaParameterEntry(schema.shared && schema.shared.moosApp, word);
  }

  if (language !== "ivp-behavior") {
    return undefined;
  }

  let ownerItem;
  for (const variant of ownerVariants(owner, language)) {
    const item = schema.behaviors && schema.behaviors[variant];
    if (item && !ownerItem) {
      ownerItem = item;
    }
    const entry = schemaParameterEntry(item, word);
    if (entry) {
      return entry;
    }
  }

  if ((ownerItem && ownerItem.inherits || []).includes("ivpContactBehavior")) {
    const contactEntry = schemaParameterEntry(schema.shared && schema.shared.ivpContactBehavior, word);
    if (contactEntry) {
      return contactEntry;
    }
  }

  return schemaParameterEntry(schema.shared && schema.shared.ivpBehavior, word);
}

function collectConfigDiagnosticRecords(document, diagnosticSchema, language, options = {}) {
  const diagnostics = [];
  const state = createBlockState();

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const rawLine = document.lineAt(lineNumber).text;
    const text = stripInlineComment(rawLine);

    const header = language === "moos"
      ? text.match(/^(\s*)(ProcessConfig)(\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)/i)
      : text.match(/^(\s*)(Behavior)(\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)/);
    if (header) {
      state.pendingOwner = header[4];
      state.pendingKind = language === "moos" ? "app" : "behavior";
      applyBlockState(text, state);
      continue;
    }

    if (state.owner) {
      const assignment = text.match(/^(\s*)([A-Za-z_][A-Za-z0-9_+:-]*(?:\[[^\]]+\])?)(\s*=\s*)(.*?)\s*$/);
      if (assignment) {
        const name = assignment[2];
        const value = assignment[4];
        const entry = diagnosticSchemaEntry(state.owner, name, language, diagnosticSchema);
        const expected = validateSchemaValue(value, entry, options);
        if (expected) {
          diagnostics.push({
            lineNumber,
            valueStart: assignment[1].length + name.length + assignment[3].length,
            valueText: value,
            message: diagnosticMessage(name, expected)
          });
        }
      }
    }

    applyBlockState(text, state);
  }

  return diagnostics;
}

function collectBehaviorDiagnosticRecords(document, diagnosticSchema, options = {}) {
  return collectConfigDiagnosticRecords(document, diagnosticSchema, "ivp-behavior", options);
}

function collectMoosDiagnosticRecords(document, diagnosticSchema, options = {}) {
  return collectConfigDiagnosticRecords(document, diagnosticSchema, "moos", options);
}

module.exports = {
  collectBehaviorDiagnosticRecords,
  collectConfigDiagnosticRecords,
  collectMoosDiagnosticRecords,
  diagnosticSchemaEntry
};
