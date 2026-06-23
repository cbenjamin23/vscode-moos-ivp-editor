const {
  parameterLookupName,
  stripInlineComment,
  createBlockState,
  applyBlockState
} = require("./scanner");
const {
  keyFor,
  normalizedName
} = require("./registry");
const {
  BEHAVIOR_INHERITED_PARAMETERS,
  MOOS_COMMON_APP_PARAMETERS,
  ownerVariants,
  scopedLookup
} = require("./hover");

const SEMANTIC_TOKEN_TYPES = [
  "keyword",
  "class",
  "property",
  "macro"
];

const SEMANTIC_TOKEN_MODIFIERS = [
  "block",
  "directive",
  "moosApp",
  "behavior",
  "parameter",
  "documented",
  "sourceBacked",
  "unknown"
];

const MOOS_GLOBAL_KEYS = new Set([
  "community",
  "serverhost",
  "serverport",
  "latorigin",
  "longorigin",
  "moostimewarp"
]);

function lower(value) {
  return value.toLowerCase();
}

function uniqueModifiers(modifiers) {
  return [...new Set(modifiers)];
}

function token(line, start, text, type, modifiers = []) {
  if (start < 0 || text === undefined || text === "") {
    return undefined;
  }

  return {
    line,
    start,
    length: text.length,
    type,
    modifiers
  };
}

function addToken(tokens, line, start, text, type, modifiers) {
  const item = token(line, start, text, type, modifiers);
  if (item) {
    tokens.push(item);
  }
}

function semanticTokenModifiers(item) {
  return item.modifiers || [];
}

function lookupOwner(owner, language, docLookup, sourceLookup) {
  if (!owner) {
    return undefined;
  }

  const variants = ownerVariants(owner, language);
  for (const variant of variants) {
    const docItem = docLookup.ownerLookup.get(variant.toLowerCase());
    if (docItem) {
      return { item: docItem, source: "doc" };
    }

    const sourceItem = sourceLookup.ownerLookup.get(variant.toLowerCase());
    if (sourceItem) {
      return { item: sourceItem, source: "source" };
    }
  }

  return undefined;
}

function ownerModifiers(owner, language, docLookup, sourceLookup, inventoryLookup) {
  const modifiers = [language === "moos" ? "moosApp" : "behavior"];
  const found = lookupOwner(owner, language, docLookup, sourceLookup);
  if (found) {
    modifiers.push(found.source === "doc" ? "documented" : "sourceBacked");
    return uniqueModifiers(modifiers);
  }

  if (inventoryLookup && inventoryLookup.get(owner.toLowerCase())) {
    return uniqueModifiers(modifiers);
  }

  modifiers.push("unknown");
  return uniqueModifiers(modifiers);
}

function parameterModifiers(owner, name, language, docLookup, sourceLookup, inventoryLookup) {
  const lookupName = parameterLookupName(name);
  const normalized = normalizedName(lookupName);

  if (!owner) {
    return language === "moos" && MOOS_GLOBAL_KEYS.has(lower(lookupName))
      ? ["parameter"]
      : undefined;
  }

  if (language === "moos" && MOOS_COMMON_APP_PARAMETERS.has(lower(lookupName))) {
    return ["parameter"];
  }

  if (language === "ivp-behavior" && BEHAVIOR_INHERITED_PARAMETERS.has(normalized)) {
    return ["parameter"];
  }

  if (scopedLookup(owner, lookupName, language, docLookup, sourceLookup)) {
    return ["parameter"];
  }

  if (owner) {
    const variants = ownerVariants(owner, language);
    for (const variant of variants) {
      if (inventoryLookup.get(keyFor(variant, lookupName))) {
        return ["parameter"];
      }
    }
  }

  return undefined;
}

function addAssignmentTokens(tokens, lineNumber, text, match, owner, language, docLookup, sourceLookup, inventoryLookup) {
  const name = match[2];
  const nameStart = match.index + match[1].length;

  const modifiers = parameterModifiers(owner, name, language, docLookup, sourceLookup, inventoryLookup);

  if (modifiers) {
    addToken(tokens, lineNumber, nameStart, name, "property", modifiers);
  }
}

function addPreprocessorTokens(tokens, lineNumber, text) {
  const match = text.match(/^(\s*)(#(?:include|ifdef|elseifdef|endif|else|define|ifndef)\b)(.*)$/);
  if (!match) {
    return false;
  }

  addToken(tokens, lineNumber, match[1].length, match[2], "macro", ["directive"]);
  return true;
}

function parseMoosSemanticLine(tokens, lineNumber, text, state, docLookup, sourceLookup, inventoryLookup) {
  if (addPreprocessorTokens(tokens, lineNumber, text)) {
    return;
  }

  const header = text.match(/^(\s*)(ProcessConfig)(\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)/i);
  if (header) {
    const keywordStart = header[1].length;
    const ownerStart = keywordStart + header[2].length + header[3].length;
    addToken(tokens, lineNumber, keywordStart, header[2], "keyword", ["block"]);
    addToken(tokens, lineNumber, ownerStart, header[4], "class", ownerModifiers(header[4], "moos", docLookup, sourceLookup, inventoryLookup));

    state.pendingOwner = header[4];
    state.pendingKind = lower(header[4]) === "antler" || lower(header[4]) === "pantler" ? "antler" : "app";
    return;
  }

  if (!state.owner) {
    const globalAssignment = text.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)/);
    if (globalAssignment && MOOS_GLOBAL_KEYS.has(lower(globalAssignment[2]))) {
      addAssignmentTokens(tokens, lineNumber, text, globalAssignment, undefined, "moos", docLookup, sourceLookup, inventoryLookup);
    }
    return;
  }

  const runLine = text.match(/^(\s*)(Run)(\s*=\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*@)?/);
  if (runLine) {
    const keyStart = runLine[1].length;
    const ownerStart = keyStart + runLine[2].length + runLine[3].length;
    addToken(tokens, lineNumber, keyStart, runLine[2], "keyword", []);
    addToken(tokens, lineNumber, ownerStart, runLine[4], "class", ownerModifiers(runLine[4], "moos", docLookup, sourceLookup, inventoryLookup));

    if (runLine[5]) {
      const atStart = runLine.index + runLine[0].lastIndexOf("@");
      const optionsStart = atStart + 1;
      const optionsText = text.slice(optionsStart);
      const optionPattern = /\b(NewConsole|InhibitMOOSParams|Path|ExtraProcessParams|XConfig|Win32Config)\b(\s*=\s*)/g;
      for (const optionMatch of optionsText.matchAll(optionPattern)) {
        const nameStart = optionsStart + optionMatch.index;
        addToken(tokens, lineNumber, nameStart, optionMatch[1], "property", ["parameter"]);
      }
    }
    return;
  }

  const assignment = text.match(/^(\s*)([A-Za-z_][A-Za-z0-9_+:-]*(?:\[[^\]]+\])?)(\s*=\s*)/);
  if (assignment) {
    addAssignmentTokens(tokens, lineNumber, text, assignment, state.owner, "moos", docLookup, sourceLookup, inventoryLookup);
  }
}

function parseBehaviorSemanticLine(tokens, lineNumber, text, state, docLookup, sourceLookup, inventoryLookup) {
  if (addPreprocessorTokens(tokens, lineNumber, text)) {
    return;
  }

  const header = text.match(/^(\s*)(Behavior)(\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)/);
  if (header) {
    const keywordStart = header[1].length;
    const ownerStart = keywordStart + header[2].length + header[3].length;
    addToken(tokens, lineNumber, keywordStart, header[2], "keyword", ["block"]);
    addToken(tokens, lineNumber, ownerStart, header[4], "class", ownerModifiers(header[4], "ivp-behavior", docLookup, sourceLookup, inventoryLookup));

    state.pendingOwner = header[4];
    state.pendingKind = "behavior";
    return;
  }

  const directiveAssignment = text.match(/^(\s*)(initialize|set)(\s+)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)/);
  if (directiveAssignment) {
    const keywordStart = directiveAssignment[1].length;
    addToken(tokens, lineNumber, keywordStart, directiveAssignment[2], "keyword", []);
    return;
  }

  if (!state.owner) {
    const modeAssignment = text.match(/^(\s*)([A-Z][A-Z0-9_]*)(\s*=\s*)/);
    if (modeAssignment) {
      return;
    }
    return;
  }

  const assignment = text.match(/^(\s*)([A-Za-z_][A-Za-z0-9_+:-]*)(\s*=\s*)/);
  if (assignment) {
    addAssignmentTokens(tokens, lineNumber, text, assignment, state.owner, "ivp-behavior", docLookup, sourceLookup, inventoryLookup);
  }
}

function createSemanticTokensProvider(vscode, language, docLookup, sourceLookup, inventoryLookup, semanticTokenLegend) {
  return {
    provideDocumentSemanticTokens(document) {
      const builder = new vscode.SemanticTokensBuilder(semanticTokenLegend);
      const state = createBlockState();

      for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
        const rawLine = document.lineAt(lineNumber).text;
        const text = stripInlineComment(rawLine);
        const tokens = [];

        if (language === "moos") {
          parseMoosSemanticLine(tokens, lineNumber, text, state, docLookup, sourceLookup, inventoryLookup);
        } else {
          parseBehaviorSemanticLine(tokens, lineNumber, text, state, docLookup, sourceLookup, inventoryLookup);
        }

        tokens
          .sort((left, right) => left.start - right.start || right.length - left.length)
          .reduce((lastEnd, item) => {
            if (item.start >= lastEnd) {
              builder.push(
                new vscode.Range(item.line, item.start, item.line, item.start + item.length),
                item.type,
                semanticTokenModifiers(item)
              );
              return item.start + item.length;
            }
            return lastEnd;
          }, 0);

        applyBlockState(text, state);
      }

      return builder.build();
    }
  };
}

module.exports = {
  MOOS_GLOBAL_KEYS,
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  createSemanticTokensProvider,
  ownerModifiers,
  parameterModifiers
};
