const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

function loadJson(context, relativePath) {
  const filePath = path.join(context.extensionPath, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadOptionalJson(context, relativePath) {
  const filePath = path.join(context.extensionPath, relativePath);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildLookup(entries, kind) {
  const lookup = new Map();
  Object.keys(entries || {}).forEach((name) => {
    lookup.set(name.toLowerCase(), {
      name,
      kind,
      description: entries[name]
    });
  });
  return lookup;
}

function mergeLookups(...lookups) {
  const merged = new Map();
  lookups.forEach((lookup) => {
    lookup.forEach((value, key) => merged.set(key, value));
  });
  return merged;
}

function normalizedName(name) {
  return name.toLowerCase().replace(/-/g, "_");
}

function keyFor(owner, name) {
  return `${owner.toLowerCase()}:${normalizedName(name)}`;
}

function sharedParameterDescription(entries, parameterKind, blockLabel) {
  if (entries.length === 1) {
    return entries[0].description;
  }

  const descriptions = entries.map((entry) => entry.description.trim());
  if (new Set(descriptions).size === 1) {
    return descriptions[0];
  }

  return `Known ${parameterKind.toLowerCase()}. Hover inside a matching ${blockLabel} block for owner-specific details.`;
}

function sharedField(entries, field) {
  const values = entries
    .map((entry) => entry[field])
    .filter((value) => value !== undefined && value !== "");
  if (!values.length) {
    return undefined;
  }
  return new Set(values).size === 1 ? values[0] : undefined;
}

function displaySourcePath(source) {
  if (!source) {
    return undefined;
  }

  const normalized = source.replace(/\\/g, "/");
  const moosIndex = normalized.lastIndexOf("/moos-ivp/");
  if (moosIndex !== -1) {
    return normalized.slice(moosIndex + 1);
  }

  return normalized.replace(/^(\.\.\/)+/, "");
}

function buildInventoryLookup(inventory, itemKind, parameterKind, relationLabel) {
  const lookup = new Map();

  Object.keys(inventory.items || {}).forEach((name) => {
    const item = inventory.items[name] || {};
    lookup.set(name.toLowerCase(), {
      name,
      kind: itemKind,
      description: `Known ${itemKind.toLowerCase()} from the MOOS-IvP inventory.`
    });

    (item.parameters || []).forEach((parameterName) => {
      lookup.set(keyFor(name, parameterName), {
        name: parameterName,
        owner: name,
        kind: parameterKind,
        description: `Known ${parameterKind.toLowerCase()} for ${name} from the MOOS-IvP inventory.`
      });
    });
  });

  Object.keys(inventory.parameters || {}).forEach((name) => {
    lookup.set(name.toLowerCase(), {
      name,
      kind: parameterKind,
      description: `Known ${parameterKind.toLowerCase()}. Hover inside a matching ${relationLabel.slice(0, -1)} block for owner-specific details.`
    });
  });

  return lookup;
}

function buildDocLookup(docs, itemKind, parameterKind, blockLabel) {
  const lookup = new Map();
  const ownerLookup = new Map();

  Object.keys(docs.items || {}).forEach((owner) => {
    const item = docs.items[owner];
    ownerLookup.set(owner.toLowerCase(), {
      name: owner,
      kind: itemKind,
      description: item.description || `Documented ${itemKind.toLowerCase()} in ${item.doc}.`,
      doc: item.doc,
      aliasOf: item.aliasOf
    });

    Object.keys(item.parameters || {}).forEach((name) => {
      const entry = item.parameters[name];
      lookup.set(keyFor(owner, name), {
        name,
        owner,
        kind: parameterKind,
        description: entry.description,
        doc: entry.doc,
        aliasOf: item.aliasOf,
        default: entry.default,
        defaultSource: entry.defaultSource,
        defaultReference: entry.defaultReference,
        example: entry.example,
        exampleSource: entry.exampleSource
      });
    });
  });

  Object.keys(docs.parameters || {}).forEach((name) => {
    const entries = docs.parameters[name] || [];
    if (!entries.length) return;

    lookup.set(normalizedName(name), {
      name,
      kind: parameterKind,
      description: sharedParameterDescription(entries, parameterKind, blockLabel),
      doc: sharedField(entries, "doc"),
      default: sharedField(entries, "default"),
      defaultSource: sharedField(entries, "defaultSource"),
      defaultReference: sharedField(entries, "defaultReference"),
      example: sharedField(entries, "example"),
      exampleSource: sharedField(entries, "exampleSource")
    });
  });

  return { lookup, ownerLookup };
}

function buildSourceLookup(sources, itemKind, parameterKind, blockLabel) {
  const lookup = new Map();
  const ownerLookup = new Map();

  function sourceDescription(status) {
    if (status === "local-ivp-source") {
      return `Known ${itemKind.toLowerCase()} from local MOOS-IvP ivp/src source.`;
    }
    if (status === "local-moos-source") {
      return `Known ${itemKind.toLowerCase()} from bundled MOOS source in the local checkout.`;
    }
    if (status === "editor-mode-inventory") {
      return `Known ${itemKind.toLowerCase()} from the upstream editor-mode inventory; no matching local source was found.`;
    }
    return `Known ${itemKind.toLowerCase()} from local MOOS-IvP inventory.`;
  }

  function parameterDescriptionKind(status) {
    return status === "editor-mode-inventory"
      ? `inventory-derived ${parameterKind.toLowerCase()}`
      : `source-backed ${parameterKind.toLowerCase()}`;
  }

  Object.keys(sources.items || {}).forEach((owner) => {
    const item = sources.items[owner];
    ownerLookup.set(owner.toLowerCase(), {
      name: owner,
      kind: itemKind,
      description: item.description || sourceDescription(item.sourceStatus),
      source: item.source
    });

    Object.keys(item.parameters || {}).forEach((name) => {
      const entry = item.parameters[name];
      lookup.set(keyFor(owner, name), {
        name: entry.name || name,
        owner,
        kind: parameterDescriptionKind(entry.sourceStatus),
        description: entry.description,
        source: entry.source,
        basis: entry.basis,
        default: entry.default,
        defaultSource: entry.defaultSource,
        defaultReference: entry.defaultReference,
        example: entry.example,
        exampleSource: entry.exampleSource
      });
    });
  });

  Object.keys(sources.parameters || {}).forEach((name) => {
    const entries = sources.parameters[name] || [];
    if (!entries.length) return;

    lookup.set(normalizedName(name), {
      name,
      kind: parameterKind,
      description: sharedParameterDescription(entries, parameterKind, blockLabel),
      source: sharedField(entries, "source"),
      basis: sharedField(entries, "basis"),
      default: sharedField(entries, "default"),
      defaultSource: sharedField(entries, "defaultSource"),
      defaultReference: sharedField(entries, "defaultReference"),
      example: sharedField(entries, "example"),
      exampleSource: sharedField(entries, "exampleSource")
    });
  });

  return { lookup, ownerLookup };
}

function findCurrentOwner(document, position, language) {
  const headerPattern = language === "moos"
    ? /^\s*ProcessConfig\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/
    : /^\s*Behavior\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/;
  let owner;
  let pendingOwner;

  for (let lineNumber = 0; lineNumber <= position.line; lineNumber++) {
    const line = document.lineAt(lineNumber).text;
    const header = line.match(headerPattern);
    if (header) {
      pendingOwner = header[1];
      if (line.includes("{")) owner = pendingOwner;
    } else if (pendingOwner && line.includes("{")) {
      owner = pendingOwner;
      pendingOwner = undefined;
    }

    if (/^\s*}\s*(?:\/\/.*)?$/.test(line)) {
      owner = undefined;
      pendingOwner = undefined;
    }
  }

  return owner;
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

function scopedLookup(owner, word, language, docLookup, sourceLookup) {
  if (!owner) {
    return undefined;
  }

  for (const variant of ownerVariants(owner, language)) {
    const docItem = docLookup.lookup.get(keyFor(variant, word));
    if (docItem) {
      return docItem;
    }

    const sourceItem = sourceLookup.lookup.get(keyFor(variant, word));
    if (sourceItem) {
      return sourceItem;
    }
  }

  return undefined;
}

function inventoryScopedLookup(owner, word, language, inventoryLookup) {
  if (!owner) {
    return undefined;
  }

  for (const variant of ownerVariants(owner, language)) {
    const item = inventoryLookup.get(keyFor(variant, word));
    if (item) {
      return item;
    }
  }

  return undefined;
}

function sharedBlockParameterLookup(owner, word, language, lookup) {
  const normalized = normalizedName(word);

  if (language === "moos" && MOOS_COMMON_APP_PARAMETERS.has(lower(word))) {
    return lookup.get(lower(word)) || lookup.get(normalized);
  }

  if (language === "ivp-behavior" && BEHAVIOR_INHERITED_PARAMETERS.has(normalized)) {
    return lookup.get(lower(word)) || lookup.get(normalized);
  }

  return undefined;
}

function blockParameterLookup(owner, word, language, lookup, docLookup, sourceLookup) {
  return scopedLookup(owner, word, language, docLookup, sourceLookup)
    || inventoryScopedLookup(owner, word, language, lookup)
    || sharedBlockParameterLookup(owner, word, language, lookup);
}

function assignmentKeyAtPosition(document, position, range) {
  const line = stripInlineComment(document.lineAt(position.line).text);
  const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_+:-]*(?:\[[^\]]+\])?)(\s*=\s*)/);
  if (!match) {
    return undefined;
  }

  const start = match[1].length;
  const end = start + match[2].length;
  if (range.start.character === start && range.end.character === end) {
    return match[2];
  }

  return undefined;
}

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

const MOOS_COMMON_APP_PARAMETERS = new Set([
  "apptick",
  "commstick"
]);

const BEHAVIOR_INHERITED_PARAMETERS = new Set([
  "name",
  "pwt",
  "condition",
  "updates",
  "runflag",
  "endflag",
  "inactiveflag",
  "activeflag",
  "idleflag",
  "perpetual",
  "duration_status",
  "duration_reset",
  "duration",
  "duration_idle_decay",
  "templating"
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

function stripInlineComment(line) {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < line.length - 1; index++) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (!inString && char === "/" && line[index + 1] === "/") {
      return line.slice(0, index);
    }
  }

  return line;
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
  const normalized = normalizedName(name);

  if (!owner) {
    return language === "moos" && MOOS_GLOBAL_KEYS.has(lower(name))
      ? ["parameter"]
      : undefined;
  }

  if (language === "moos" && MOOS_COMMON_APP_PARAMETERS.has(lower(name))) {
    return ["parameter"];
  }

  if (language === "ivp-behavior" && BEHAVIOR_INHERITED_PARAMETERS.has(normalized)) {
    return ["parameter"];
  }

  const scoped = scopedLookup(owner, name, language, docLookup, sourceLookup);
  if (scoped) {
    return ["parameter"];
  }

  if (owner) {
    const variants = ownerVariants(owner, language);
    for (const variant of variants) {
      if (inventoryLookup.get(keyFor(variant, name))) {
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

function applyBlockState(text, state) {
  if (state.pendingOwner && text.includes("{")) {
    state.owner = state.pendingOwner;
    state.kind = state.pendingKind;
    state.pendingOwner = undefined;
    state.pendingKind = undefined;
  }

  if (/^\s*}\s*$/.test(text) && state.owner) {
    state.owner = undefined;
    state.kind = undefined;
  }
}

function createSemanticTokensProvider(language, docLookup, sourceLookup, inventoryLookup, semanticTokenLegend) {
  return {
    provideDocumentSemanticTokens(document) {
      const builder = new vscode.SemanticTokensBuilder(semanticTokenLegend);
      const state = {
        owner: undefined,
        kind: undefined,
        pendingOwner: undefined,
        pendingKind: undefined
      };

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

function createHoverProvider(language, lookup, docLookup, sourceLookup) {
  const wordPattern = /[A-Za-z_][A-Za-z0-9_+:-]*/;

  return {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, wordPattern);
      if (!range) {
        return undefined;
      }

      const word = document.getText(range);
      const owner = findCurrentOwner(document, position, language);
      const assignmentKey = assignmentKeyAtPosition(document, position, range);
      const blockItem = blockParameterLookup(owner, word, language, lookup, docLookup, sourceLookup);
      if (owner && assignmentKey && !blockItem) {
        return undefined;
      }

      const item = blockItem
        || docLookup.lookup.get(normalizedName(word))
        || sourceLookup.lookup.get(normalizedName(word))
        || docLookup.ownerLookup.get(word.toLowerCase())
        || sourceLookup.ownerLookup.get(word.toLowerCase())
        || lookup.get(word.toLowerCase())
        || lookup.get(normalizedName(word));
      if (!item) {
        return undefined;
      }

      const markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`**${item.name}**`);
      markdown.appendMarkdown(`\n\n${item.description}`);
      if (item.default !== undefined && item.default !== "") {
        markdown.appendMarkdown(`\n\n**Default:** \`${item.default}\``);
      }
      if (item.example) {
        markdown.appendMarkdown(`\n\n**Example:** \`${item.example}\``);
      }
      if (item.aliasOf) {
        markdown.appendMarkdown(`\n\n_Using documentation for ${item.aliasOf}._`);
      }
      if (item.doc) {
        markdown.appendMarkdown(`\n\n[MOOS-IvP documentation](${item.doc})`);
      }
      if (item.source) {
        markdown.appendMarkdown(`\n\n**Source:** \`${displaySourcePath(item.source)}\``);
      }
      return new vscode.Hover(markdown, range);
    }
  };
}

function activate(context) {
  const moosData = loadJson(context, "data/moos-language.json");
  const bhvData = loadJson(context, "data/bhv-language.json");
  const moosInventory = loadOptionalJson(context, "data/moos-inventory.json");
  const bhvInventory = loadOptionalJson(context, "data/bhv-inventory.json");
  const moosDocs = loadOptionalJson(context, "data/moos-docs.json");
  const bhvDocs = loadOptionalJson(context, "data/bhv-docs.json");
  const moosSources = loadOptionalJson(context, "data/moos-source.json");
  const bhvSources = loadOptionalJson(context, "data/bhv-source.json");

  const moosLookup = mergeLookups(
    buildInventoryLookup(moosInventory, "MOOS app", "MOOS parameter", "apps"),
    buildLookup(moosData.apps, "MOOS app"),
    buildLookup(moosData.parameters, "MOOS parameter")
  );

  const bhvLookup = mergeLookups(
    buildInventoryLookup(bhvInventory, "IvP behavior", "behavior parameter", "behaviors"),
    buildLookup(bhvData.behaviors, "IvP behavior"),
    buildLookup(bhvData.parameters, "behavior parameter")
  );
  const moosDocLookup = buildDocLookup(moosDocs, "MOOS app", "MOOS parameter", "ProcessConfig");
  const bhvDocLookup = buildDocLookup(bhvDocs, "IvP behavior", "behavior parameter", "Behavior");
  const moosSourceLookup = buildSourceLookup(moosSources, "MOOS app", "MOOS parameter", "ProcessConfig");
  const bhvSourceLookup = buildSourceLookup(bhvSources, "IvP behavior", "behavior parameter", "Behavior");

  const subscriptions = [
    vscode.languages.registerHoverProvider("moos", createHoverProvider("moos", moosLookup, moosDocLookup, moosSourceLookup)),
    vscode.languages.registerHoverProvider("ivp-behavior", createHoverProvider("ivp-behavior", bhvLookup, bhvDocLookup, bhvSourceLookup))
  ];

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
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
