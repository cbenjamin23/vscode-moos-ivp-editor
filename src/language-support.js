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

  return `Recognized ${parameterKind.toLowerCase()} name used in multiple ${blockLabel} contexts. No single shared description is available yet.`;
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

function schemaParameterEntry(container, word) {
  if (!container) {
    return undefined;
  }

  const parameters = container.parameters || container;
  return parameters[word]
    || parameters[lower(word)]
    || parameters[normalizedName(word)];
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

function schemaDefault(entry) {
  if (!entry || entry.default === undefined || entry.default === "") {
    return undefined;
  }
  if (/sentinel/i.test(entry.defaultKind || "")) {
    return undefined;
  }
  return entry.default;
}

function isNumberLiteral(value) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim());
}

function stripValue(value) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function expectedDescription(entry) {
  const constraints = entry.constraints || {};
  if (entry.valueType === "enum") {
    return `one of: ${(constraints.enum || []).join(", ")}`;
  }
  if (entry.valueType === "boolean-token") {
    return `one of: ${(constraints.enum || []).join(", ")}`;
  }
  if (entry.valueType === "number-or-enum") {
    const number = constraints.number || {};
    return `${expectedNumberDescription(number)}, or one of: ${(constraints.enum || []).join(", ")}`;
  }
  if (entry.valueType === "number-or-delta") {
    return "a number or delta:<number>";
  }
  if (entry.valueType === "number-or-adjustment") {
    return "a number, delta:<number>, or scale:<number>";
  }
  if (entry.valueType === "number-range") {
    return expectedNumberRangeDescription(constraints);
  }
  if (entry.valueType === "number") {
    return expectedNumberDescription(constraints);
  }
  if (entry.valueType === "number-pair-ascending") {
    return "two comma-separated numbers with the first >= 0 and <= the second";
  }
  if (entry.valueType === "number-pair") {
    return "two comma-separated numbers";
  }
  if (entry.valueType === "ip-address") {
    return "localhost or an IPv4 address with each field in 0..255";
  }
  if (entry.valueType === "tif-file") {
    return "a .tif file path with no spaces";
  }
  if (entry.valueType === "single-equals-pair") {
    return "a field=value pair with exactly one equals sign";
  }
  if (entry.valueType === "comma-list-no-whitespace") {
    return "a comma-separated list of non-empty items with no spaces or tabs";
  }
  if (entry.valueType === "no-whitespace-string") {
    return "a string with no spaces or tabs";
  }
  if (entry.valueType === "non-empty-string") {
    return "a non-empty string";
  }
  if (entry.valueType === "non-empty-no-whitespace-string") {
    return "a non-empty string with no spaces or tabs";
  }
  return entry.valueType || "a valid value";
}

function expectedNumberDescription(constraints) {
  const parts = [];
  const numberKind = constraints.integer ? "integer" : "number";
  const article = constraints.integer ? "an" : "a";
  if (constraints.minimum !== undefined) {
    parts.push(`${constraints.minimumExclusive ? ">" : ">="} ${constraints.minimum}`);
  }
  if (constraints.maximum !== undefined) {
    parts.push(`${constraints.maximumExclusive ? "<" : "<="} ${constraints.maximum}`);
  }

  return parts.length ? `${article} ${numberKind} ${parts.join(" and ")}` : `${article} ${numberKind}`;
}

function expectedNumberRangeDescription(constraints) {
  const numberDescription = expectedNumberDescription(constraints);
  return `${numberDescription} or ${numberDescription}:${numberDescription} with the left value <= the right value`;
}

function numberSatisfiesConstraints(number, constraints) {
  if (constraints.minimum !== undefined) {
    if (constraints.minimumExclusive && !(number > constraints.minimum)) {
      return false;
    }
    if (!constraints.minimumExclusive && !(number >= constraints.minimum)) {
      return false;
    }
  }
  if (constraints.maximum !== undefined) {
    if (constraints.maximumExclusive && !(number < constraints.maximum)) {
      return false;
    }
    if (!constraints.maximumExclusive && !(number <= constraints.maximum)) {
      return false;
    }
  }
  return true;
}

function validateSchemaValue(value, entry) {
  if (!entry || entry.diagnostic !== true) {
    return undefined;
  }

  const raw = stripValue(value);
  const normalized = entry.constraints && entry.constraints.caseInsensitive
    ? lower(raw)
    : raw;

  if (entry.valueType === "enum" || entry.valueType === "boolean-token") {
    const allowed = (entry.constraints.enum || []).map((item) => (
      entry.constraints.caseInsensitive ? lower(item) : item
    ));
    return allowed.includes(normalized) ? undefined : expectedDescription(entry);
  }

  if (entry.valueType === "number") {
    if (!isNumberLiteral(raw)) {
      return expectedDescription(entry);
    }
    const number = Number(raw);
    if (entry.constraints && entry.constraints.integer && !Number.isInteger(number)) {
      return expectedDescription(entry);
    }
    if (!numberSatisfiesConstraints(number, entry.constraints || {})) {
      return expectedDescription(entry);
    }
    return undefined;
  }

  if (entry.valueType === "number-or-enum") {
    const allowed = (entry.constraints.enum || []).map((item) => (
      entry.constraints.caseInsensitive ? lower(item) : item
    ));
    if (allowed.includes(normalized)) {
      return undefined;
    }
    if (!isNumberLiteral(raw)) {
      return expectedDescription(entry);
    }
    const number = Number(raw);
    const numberConstraints = entry.constraints.number || {};
    if (numberConstraints.integer && !Number.isInteger(number)) {
      return expectedDescription(entry);
    }
    if (!numberSatisfiesConstraints(number, numberConstraints)) {
      return expectedDescription(entry);
    }
    return undefined;
  }

  if (entry.valueType === "number-or-delta") {
    if (isNumberLiteral(raw)) {
      return undefined;
    }
    if (lower(raw).startsWith("delta:")) {
      const delta = raw.slice(raw.indexOf(":") + 1).trim();
      return isNumberLiteral(delta) ? undefined : expectedDescription(entry);
    }
    return expectedDescription(entry);
  }

  if (entry.valueType === "number-or-adjustment") {
    if (isNumberLiteral(raw)) {
      return undefined;
    }
    const lowered = lower(raw);
    if (lowered.startsWith("delta:") || lowered.startsWith("scale:")) {
      const value = raw.slice(raw.indexOf(":") + 1).trim();
      return isNumberLiteral(value) ? undefined : expectedDescription(entry);
    }
    return expectedDescription(entry);
  }

  if (entry.valueType === "number-range") {
    const parts = raw.split(":").map((part) => part.trim());
    if (parts.length < 1 || parts.length > 2 || parts.some((part) => !isNumberLiteral(part))) {
      return expectedDescription(entry);
    }

    const first = Number(parts[0]);
    const second = parts.length === 2 ? Number(parts[1]) : first;
    if (!numberSatisfiesConstraints(first, entry.constraints || {})
      || !numberSatisfiesConstraints(second, entry.constraints || {})
      || first > second) {
      return expectedDescription(entry);
    }
    return undefined;
  }

  if (entry.valueType === "number-pair-ascending") {
    const parts = raw.split(",").map((part) => part.trim());
    if (parts.length !== 2 || !isNumberLiteral(parts[0]) || !isNumberLiteral(parts[1])) {
      return expectedDescription(entry);
    }
    const first = Number(parts[0]);
    const second = Number(parts[1]);
    return first >= 0 && first <= second ? undefined : expectedDescription(entry);
  }

  if (entry.valueType === "number-pair") {
    const parts = raw.split(",").map((part) => part.trim());
    return parts.length === 2 && isNumberLiteral(parts[0]) && isNumberLiteral(parts[1])
      ? undefined
      : expectedDescription(entry);
  }

  if (entry.valueType === "ip-address") {
    if (lower(raw) === "localhost") {
      return undefined;
    }
    const parts = raw.split(".").map((part) => part.trim());
    const valid = parts.length === 4 && parts.every((part) => (
      isNumberLiteral(part) && Number(part) >= 0 && Number(part) <= 255
    ));
    return valid ? undefined : expectedDescription(entry);
  }

  if (entry.valueType === "tif-file") {
    return !/\s/.test(raw) && !raw.startsWith("=") && lower(raw).endsWith(".tif")
      ? undefined
      : expectedDescription(entry);
  }

  if (entry.valueType === "single-equals-pair") {
    const parts = raw.split("=");
    return parts.length === 2 && parts[0].trim() !== "" && parts[1].trim() !== ""
      ? undefined
      : expectedDescription(entry);
  }

  if (entry.valueType === "comma-list-no-whitespace") {
    const parts = raw.split(",").map((part) => part.trim());
    const valid = parts.length > 0 && parts.every((part) => (
      part !== "" && !/\s/.test(part)
    ));
    return valid ? undefined : expectedDescription(entry);
  }

  if (entry.valueType === "no-whitespace-string") {
    return /\s/.test(raw) ? expectedDescription(entry) : undefined;
  }

  if (entry.valueType === "non-empty-string") {
    return raw === "" ? expectedDescription(entry) : undefined;
  }

  if (entry.valueType === "non-empty-no-whitespace-string") {
    return raw === "" || /\s/.test(raw) ? expectedDescription(entry) : undefined;
  }

  return undefined;
}

function buildInventoryLookup(inventory, itemKind, parameterKind, relationLabel) {
  const lookup = new Map();

  Object.keys(inventory.items || {}).forEach((name) => {
    const item = inventory.items[name] || {};
    lookup.set(name.toLowerCase(), {
      name,
      kind: itemKind,
      description: `Recognized ${itemKind.toLowerCase()} from the MOOS-IvP inventory.`
    });

    (item.parameters || []).forEach((parameterName) => {
      lookup.set(keyFor(name, parameterName), {
        name: parameterName,
        owner: name,
        kind: parameterKind,
        description: `Recognized ${parameterKind.toLowerCase()} for ${name}; source-backed hover text is not available yet.`
      });
    });
  });

  Object.keys(inventory.parameters || {}).forEach((name) => {
    lookup.set(name.toLowerCase(), {
      name,
      kind: parameterKind,
      description: `Recognized ${parameterKind.toLowerCase()} name from the MOOS-IvP inventory. Block-specific hover text is not available yet.`
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
  const inventoryItem = inventoryScopedLookup(owner, word, language, lookup);
  const sharedItem = sharedBlockParameterLookup(owner, word, language, lookup);
  if (!inventoryItem && !sharedItem) {
    return undefined;
  }

  return scopedLookup(owner, word, language, docLookup, sourceLookup)
    || commonMoosParameterHover(word, language)
    || (sharedItem && docLookup.lookup.get(normalizedName(word)))
    || (sharedItem && sourceLookup.lookup.get(normalizedName(word)))
    || sharedItem
    || inventoryItem;
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

function blockOwnerAtPosition(document, position, range, language) {
  const line = stripInlineComment(document.lineAt(position.line).text);
  const match = language === "moos"
    ? line.match(/^(\s*)(ProcessConfig)(\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)/)
    : line.match(/^(\s*)(Behavior)(\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)/);
  if (!match) {
    return undefined;
  }

  const start = match[1].length + match[2].length + match[3].length;
  const end = start + match[4].length;
  return range.start.character === start && range.end.character === end
    ? match[4]
    : undefined;
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

const MOOS_COMMON_PARAMETER_HOVERS = new Map([
  ["apptick", {
    name: "AppTick",
    kind: "MOOS parameter",
    description: "Sets the target Iterate() rate for this MOOS app, in Hertz.",
    default: "4",
    example: "AppTick = 4"
  }],
  ["commstick", {
    name: "CommsTick",
    kind: "MOOS parameter",
    description: "Sets the target MOOS communications processing rate for this app, in Hertz.",
    default: "4",
    example: "CommsTick = 4"
  }]
]);

const BEHAVIOR_CONDITION_NOTE = "**Note:** Multiple `condition = ...` lines are combined as AND; every condition must be true before the behavior can run. To express OR, use `or` inside a single condition expression, e.g. `condition = (MODE = LOITERING) or (MODE = RETURNING)`.";
const BEHAVIOR_FLAG_NOTE = "**Note:** Add `[if] <logic condition>` to post this flag only when the condition is true, e.g. `runflag = REPORT=true [if] DEPLOY=true`.";
const PMISSION_EVAL_CONDITION_NOTE = "**Note:** Multiple `lead_condition` and `pass_condition` lines are combined as AND; all must be true. Multiple `fail_condition` lines are combined as OR; any true fail condition causes failure.";
const BEHAVIOR_UPDATES_DESCRIPTION_SUFFIX = " Post update strings to that variable, such as `speed=2.0 # radius=8` or `name=survey # speed=2.0`.";

const BEHAVIOR_FLAG_PARAMETERS = new Set([
  "active_flag",
  "activeflag",
  "config_flag",
  "configflag",
  "end_flag",
  "endflag",
  "idle_flag",
  "idleflag",
  "inactive_flag",
  "inactiveflag",
  "run_flag",
  "runflag",
  "runx_flag",
  "runxflag",
  "spawn_flag",
  "spawnflag",
  "spawnx_flag",
  "spawnxflag"
]);

const PMISSION_EVAL_CONDITION_PARAMETERS = new Set([
  "fail_condition",
  "lead_condition",
  "pass_condition"
]);

function parameterNote(language, item) {
  const name = normalizedName(item.name);
  const owner = lower(item.owner || "");

  if (language === "ivp-behavior") {
    if (name === "condition") {
      return BEHAVIOR_CONDITION_NOTE;
    }
    if (BEHAVIOR_FLAG_PARAMETERS.has(name)) {
      return BEHAVIOR_FLAG_NOTE;
    }
  }

  if (language === "moos"
    && owner === "pmissioneval"
    && PMISSION_EVAL_CONDITION_PARAMETERS.has(name)) {
    return PMISSION_EVAL_CONDITION_NOTE;
  }

  return undefined;
}

function parameterDescription(language, item) {
  if (language === "ivp-behavior" && normalizedName(item.name) === "updates") {
    return `${item.description}${BEHAVIOR_UPDATES_DESCRIPTION_SUFFIX}`;
  }
  return item.description;
}

function commonMoosParameterHover(word, language) {
  if (language !== "moos") {
    return undefined;
  }
  return MOOS_COMMON_PARAMETER_HOVERS.get(lower(word));
}

const BEHAVIOR_INHERITED_PARAMETERS = new Set([
  "active_flag",
  "activeflag",
  "build_info",
  "comms_policy",
  "condition",
  "config_flag",
  "configflag",
  "descriptor",
  "duration",
  "duration_idle_decay",
  "duration_reset",
  "duration_status",
  "end_flag",
  "endflag",
  "idle_flag",
  "idleflag",
  "inactive_flag",
  "inactiveflag",
  "max_spawnings",
  "name",
  "no_starve",
  "nostarve",
  "perpetual",
  "post_mapping",
  "precision",
  "priority",
  "priwt",
  "pwt",
  "run_flag",
  "runflag",
  "runx_flag",
  "runxflag",
  "spawn_flag",
  "spawnflag",
  "spawnx_flag",
  "spawnxflag",
  "templating",
  "updates",
  "us"
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

function braceDelta(text) {
  let delta = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
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
    if (inString) {
      continue;
    }
    if (char === "{") {
      delta++;
    } else if (char === "}") {
      delta--;
    }
  }

  return delta;
}

function hasOpeningBrace(text) {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
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
    if (!inString && char === "{") {
      return true;
    }
  }

  return false;
}

function blockHeaderPattern(language) {
  return language === "moos"
    ? /^\s*ProcessConfig\s*=\s*[A-Za-z_][A-Za-z0-9_]*/i
    : /^\s*Behavior\s*=\s*[A-Za-z_][A-Za-z0-9_]*/;
}

function collectBlockFoldingRanges(document, language) {
  const ranges = [];
  const headerPattern = blockHeaderPattern(language);
  let current;

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const text = stripInlineComment(document.lineAt(lineNumber).text);
    if (headerPattern.test(text) && (!current || !current.opened)) {
      current = {
        startLine: lineNumber,
        depth: 0,
        opened: false
      };
    }

    if (!current) {
      continue;
    }

    const delta = braceDelta(text);
    if (!current.opened) {
      if (!hasOpeningBrace(text)) {
        continue;
      }
      current.opened = true;
    }

    current.depth += delta;
    if (current.depth <= 0) {
      if (lineNumber > current.startLine) {
        ranges.push(new vscode.FoldingRange(current.startLine, lineNumber));
      }
      current = undefined;
    }
  }

  return ranges;
}

function createFoldingRangeProvider(language) {
  return {
    provideFoldingRanges(document) {
      return collectBlockFoldingRanges(document, language);
    }
  };
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

function createHoverProvider(language, lookup, docLookup, sourceLookup, diagnosticSchema) {
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
      const headerOwner = blockOwnerAtPosition(document, position, range, language);
      if (!assignmentKey && !headerOwner) {
        return undefined;
      }

      const blockItem = blockParameterLookup(owner, word, language, lookup, docLookup, sourceLookup);
      const schemaEntry = diagnosticSchemaEntry(owner, word, language, diagnosticSchema);
      if (owner && assignmentKey && !blockItem) {
        return undefined;
      }

      const item = headerOwner
        ? docLookup.ownerLookup.get(word.toLowerCase())
          || sourceLookup.ownerLookup.get(word.toLowerCase())
          || lookup.get(word.toLowerCase())
        : blockItem
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
      markdown.appendMarkdown(`\n\n${parameterDescription(language, item)}`);
      const defaultValue = item.default !== undefined && item.default !== ""
        ? item.default
        : schemaDefault(schemaEntry);
      if (defaultValue !== undefined) {
        markdown.appendMarkdown(`\n\n**Default:** \`${defaultValue}\``);
      }
      if (item.example) {
        markdown.appendMarkdown(`\n\n**Example:** \`${item.example}\``);
      }
      const note = parameterNote(language, item);
      if (note) {
        markdown.appendMarkdown(`\n\n${note}`);
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

function collectConfigDiagnostics(document, diagnosticSchema, language) {
  const diagnostics = [];
  const state = {
    owner: undefined,
    kind: undefined,
    pendingOwner: undefined,
    pendingKind: undefined
  };

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
      const assignment = text.match(/^(\s*)([A-Za-z_][A-Za-z0-9_+:-]*)(\s*=\s*)(.*?)\s*$/);
      if (assignment) {
        const name = assignment[2];
        const value = assignment[4];
        const entry = diagnosticSchemaEntry(state.owner, name, language, diagnosticSchema);
        const expected = validateSchemaValue(value, entry);
        if (expected) {
          const valueStart = assignment[1].length + name.length + assignment[3].length;
          diagnostics.push(createDiagnostic(
            document,
            lineNumber,
            valueStart,
            value,
            `${name} expects ${expected}.`
          ));
        }
      }
    }

    applyBlockState(text, state);
  }

  return diagnostics;
}

function collectBehaviorDiagnostics(document, diagnosticSchema) {
  return collectConfigDiagnostics(document, diagnosticSchema, "ivp-behavior");
}

function collectMoosDiagnostics(document, diagnosticSchema) {
  return collectConfigDiagnostics(document, diagnosticSchema, "moos");
}

function refreshDiagnostics(document, collection, diagnosticSchema) {
  if (document.languageId === "ivp-behavior") {
    collection.set(document.uri, collectBehaviorDiagnostics(document, diagnosticSchema));
    return;
  }

  if (document.languageId === "moos") {
    collection.set(document.uri, collectMoosDiagnostics(document, diagnosticSchema));
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
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
    })
  );
}

function registerLanguageSupport(context) {
  const moosData = loadJson(context, "data/moos-language.json");
  const bhvData = loadJson(context, "data/bhv-language.json");
  const moosInventory = loadOptionalJson(context, "data/moos-inventory.json");
  const bhvInventory = loadOptionalJson(context, "data/bhv-inventory.json");
  const moosDocs = loadOptionalJson(context, "data/moos-docs.json");
  const bhvDocs = loadOptionalJson(context, "data/bhv-docs.json");
  const moosSources = loadOptionalJson(context, "data/moos-source.json");
  const bhvSources = loadOptionalJson(context, "data/bhv-source.json");
  const diagnosticSchema = loadOptionalJson(context, "data/diagnostic-schema.json");

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
    vscode.languages.registerHoverProvider("moos", createHoverProvider("moos", moosLookup, moosDocLookup, moosSourceLookup, diagnosticSchema)),
    vscode.languages.registerHoverProvider("ivp-behavior", createHoverProvider("ivp-behavior", bhvLookup, bhvDocLookup, bhvSourceLookup, diagnosticSchema))
  ];

  if (vscode.languages.registerFoldingRangeProvider) {
    subscriptions.push(
      vscode.languages.registerFoldingRangeProvider("moos", createFoldingRangeProvider("moos")),
      vscode.languages.registerFoldingRangeProvider("ivp-behavior", createFoldingRangeProvider("ivp-behavior"))
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
  collectMoosDiagnostics,
  collectBehaviorDiagnostics,
  validateSchemaValue,
  findCurrentOwner,
  blockParameterLookup
};
