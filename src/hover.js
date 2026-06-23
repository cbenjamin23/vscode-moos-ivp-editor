const {
  parameterLookupName,
  findCurrentOwner,
  assignmentKeyAtPosition,
  blockOwnerAtPosition
} = require("./scanner");
const {
  diagnosticSchemaEntry
} = require("./diagnostics");
const {
  keyFor,
  normalizedName
} = require("./registry");

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

const BEHAVIOR_CONDITION_NOTE = "**Note:** Multiple `condition = ...` lines are combined as AND; every condition must be true before the behavior can run. To express OR, use `or` inside a single condition expression, e.g. `condition = (MODE = LOITERING) or (MODE = RETURNING)`.";
const BEHAVIOR_FLAG_NOTE = "**Note:** Add `[if] <logic condition>` to post this flag only when the condition is true, e.g. `runflag = REPORT=true [if] DEPLOY=true`.";
const PMISSION_EVAL_CONDITION_NOTE = "**Note:** Multiple `lead_condition` and `pass_condition` lines are combined as AND; all must be true. Multiple `fail_condition` lines are combined as OR; any true fail condition causes failure.";
const BEHAVIOR_UPDATES_NOTE = "**Note:** At runtime, post behavior parameter updates to the named MOOS variable. Use `#` to combine multiple assignments, e.g. `SURVEY_UPDATES = speed=2.0 # radius=8`.";

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

function lower(value) {
  return value.toLowerCase();
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

function schemaDefault(entry) {
  if (!entry || entry.default === undefined || entry.default === "") {
    return undefined;
  }
  if (/sentinel/i.test(entry.defaultKind || "")) {
    return undefined;
  }
  return entry.default;
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

  const lookupWord = parameterLookupName(word);
  for (const variant of ownerVariants(owner, language)) {
    const docItem = docLookup.lookup.get(keyFor(variant, lookupWord));
    if (docItem) {
      return docItem;
    }

    const sourceItem = sourceLookup.lookup.get(keyFor(variant, lookupWord));
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

  const lookupWord = parameterLookupName(word);
  for (const variant of ownerVariants(owner, language)) {
    const item = inventoryLookup.get(keyFor(variant, lookupWord));
    if (item) {
      return item;
    }
  }

  return undefined;
}

function sharedBlockParameterLookup(owner, word, language, lookup) {
  const lookupWord = parameterLookupName(word);
  const normalized = normalizedName(lookupWord);

  if (language === "moos" && MOOS_COMMON_APP_PARAMETERS.has(lower(lookupWord))) {
    return lookup.get(lower(lookupWord)) || lookup.get(normalized);
  }

  if (language === "ivp-behavior" && BEHAVIOR_INHERITED_PARAMETERS.has(normalized)) {
    return lookup.get(lower(lookupWord)) || lookup.get(normalized);
  }

  return undefined;
}

function blockParameterLookup(owner, word, language, lookup, docLookup, sourceLookup) {
  const lookupWord = parameterLookupName(word);
  const scopedItem = scopedLookup(owner, lookupWord, language, docLookup, sourceLookup);
  const inventoryItem = inventoryScopedLookup(owner, lookupWord, language, lookup);
  const sharedItem = sharedBlockParameterLookup(owner, lookupWord, language, lookup);

  if (!scopedItem && !inventoryItem && !sharedItem) {
    return undefined;
  }

  return scopedItem
    || commonMoosParameterHover(lookupWord, language)
    || (sharedItem && docLookup.lookup.get(normalizedName(lookupWord)))
    || (sharedItem && sourceLookup.lookup.get(normalizedName(lookupWord)))
    || sharedItem
    || inventoryItem;
}

function parameterNote(language, item) {
  const name = normalizedName(item.name);
  const owner = lower(item.owner || "");

  if (language === "ivp-behavior") {
    if (name === "condition") {
      return BEHAVIOR_CONDITION_NOTE;
    }
    if (name === "updates") {
      return BEHAVIOR_UPDATES_NOTE;
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

function commonMoosParameterHover(word, language) {
  if (language !== "moos") {
    return undefined;
  }
  return MOOS_COMMON_PARAMETER_HOVERS.get(lower(word));
}

function createHoverProvider(vscode, language, lookup, docLookup, sourceLookup, diagnosticSchema) {
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
      markdown.appendMarkdown(`\n\n${item.description}`);
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

module.exports = {
  BEHAVIOR_INHERITED_PARAMETERS,
  MOOS_COMMON_APP_PARAMETERS,
  blockParameterLookup,
  createHoverProvider,
  displaySourcePath,
  ownerVariants,
  scopedLookup
};
