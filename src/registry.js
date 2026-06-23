const fs = require("fs");
const path = require("path");
const { parameterLookupName } = require("./scanner");

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
  return `${owner.toLowerCase()}:${normalizedName(parameterLookupName(name))}`;
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

function loadLanguageRegistry(context) {
  const moosData = loadJson(context, "data/moos-language.json");
  const bhvData = loadJson(context, "data/bhv-language.json");
  const moosInventory = loadOptionalJson(context, "data/moos-inventory.json");
  const bhvInventory = loadOptionalJson(context, "data/bhv-inventory.json");
  const moosDocs = loadOptionalJson(context, "data/moos-docs.json");
  const bhvDocs = loadOptionalJson(context, "data/bhv-docs.json");
  const moosSources = loadOptionalJson(context, "data/moos-source.json");
  const bhvSources = loadOptionalJson(context, "data/bhv-source.json");
  const diagnosticSchema = loadOptionalJson(context, "data/diagnostic-schema.json");

  return {
    moosLookup: mergeLookups(
      buildInventoryLookup(moosInventory, "MOOS app", "MOOS parameter", "apps"),
      buildLookup(moosData.apps, "MOOS app"),
      buildLookup(moosData.parameters, "MOOS parameter")
    ),
    bhvLookup: mergeLookups(
      buildInventoryLookup(bhvInventory, "IvP behavior", "behavior parameter", "behaviors"),
      buildLookup(bhvData.behaviors, "IvP behavior"),
      buildLookup(bhvData.parameters, "behavior parameter")
    ),
    moosDocLookup: buildDocLookup(moosDocs, "MOOS app", "MOOS parameter", "ProcessConfig"),
    bhvDocLookup: buildDocLookup(bhvDocs, "IvP behavior", "behavior parameter", "Behavior"),
    moosSourceLookup: buildSourceLookup(moosSources, "MOOS app", "MOOS parameter", "ProcessConfig"),
    bhvSourceLookup: buildSourceLookup(bhvSources, "IvP behavior", "behavior parameter", "Behavior"),
    diagnosticSchema
  };
}

module.exports = {
  buildDocLookup,
  buildInventoryLookup,
  buildLookup,
  buildSourceLookup,
  keyFor,
  loadJson,
  loadLanguageRegistry,
  loadOptionalJson,
  mergeLookups,
  normalizedName
};
