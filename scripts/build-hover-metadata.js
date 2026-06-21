const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MOOS_ROOT = process.env.MOOS_IVP_ROOT || "/Users/charlesbenjamin/moos-ivp";
const SRC_ROOT = path.join(MOOS_ROOT, "ivp", "src");

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

function loadOptionalJson(relativePath) {
  const file = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, data) {
  fs.writeFileSync(path.join(REPO_ROOT, relativePath), `${JSON.stringify(data, null, 2)}\n`);
}

function normalizeName(name) {
  return name.toLowerCase().replace(/-/g, "_");
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (![".git", "build", "node_modules", "LOGS"].includes(entry.name)) {
          stack.push(full);
        }
      } else if (entry.isFile() && predicate(full)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function cleanValue(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/^["'`{]+|["'`}]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*(?:Section|Listing|Figure)\s+\d+(?:\.\d+)?\.?$/i, "")
    .replace(/^(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)*)\s+(?:meters?|secs?|seconds?|minutes?|contacts?|points?)$/i, "$1")
    .replace(/\s+(?:meters?|secs?|seconds?|minutes?|contacts?|points?)$/i, "")
    .replace(/^zero$/i, "0")
    .replace(/[.;,]+$/g, "")
    .trim();
}

function literalValue(value) {
  const raw = String(value || "").trim();
  const clean = cleanValue(raw);
  if (!clean) return "";
  if (/^["'`]/.test(raw)) return clean;
  if (/^(true|false)$/i.test(clean)) return clean.toLowerCase();
  if (/^-?\d+(?:\.\d+)?$/.test(clean)) return clean;
  if (/^""$/.test(clean)) return "\"\"";
  return "";
}

function extractDefaultFromDescription(description) {
  if (!description) return undefined;
  const patterns = [
    /\bdefault(?:\s+value)?\s+(?:is|=|:)\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|\{([^}]+)\}|([^.;\n]+))/i,
    /\bdefaults?\s+to\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|\{([^}]+)\}|([^.;\n]+))/i,
    /\bby\s+default(?:\s+this)?\s+(?:is\s+|it\s+is\s+)?(?:"([^"]+)"|'([^']+)'|`([^`]+)`|\{([^}]+)\}|([^.;\n]+))/i,
    /\bdefault\s+it\s+(true|false|-?\d+(?:\.\d+)?|[A-Za-z0-9_.:+/-]+)/i,
    /\bdefault\s+(true|false|-?\d+(?:\.\d+)?|[A-Za-z0-9_.:+/-]+)/i
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (!match) continue;
    const value = cleanValue(match.slice(1).find(Boolean));
    if (!value) continue;
    if (/^(in|if|when|for|and|or|with|meaning|color|voice|value|setting|meters?|secs?|seconds?|minutes?)\b/i.test(value)) continue;
    return value;
  }
  return undefined;
}

function parseExampleLines(file, headerRegex) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let owner = "";
  for (const line of lines) {
    const header = line.match(headerRegex);
    if (header) owner = header[1];
    if (/^\s*}\s*$/.test(line)) owner = "";
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_+:-]*)\s*=\s*(.*?)\s*$/);
    if (owner && match) {
      map.set(`${owner}:${normalizeName(match[1])}`, line.trim());
    }
  }
  return map;
}

function sourceFilesForItem(item) {
  const files = new Set();
  const dirs = new Set();
  for (const source of item.sources || []) {
    if (source.includes("editor-modes")) continue;
    const full = path.resolve(REPO_ROOT, source);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      dirs.add(full);
    } else if (fs.existsSync(full)) {
      files.add(full);
      const parsed = path.parse(full);
      for (const extension of [".h", ".hpp", ".cpp"]) {
        const sibling = path.join(parsed.dir, `${parsed.name}${extension}`);
        if (fs.existsSync(sibling)) files.add(sibling);
      }
    }
  }
  for (const dir of dirs) {
    for (const file of walk(dir, (candidate) => /\.(cpp|h|hpp)$/.test(candidate))) {
      files.add(file);
    }
  }
  return Array.from(files).sort();
}

function extractQuotedLines(text) {
  const lines = [];
  const regex = /(?:blk|blu|mag|cyn|grn)\("((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    lines.push(match[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\"));
  }
  return lines;
}

function defaultFromComment(comment, assignedValue) {
  if (!comment || !/default/i.test(comment)) return undefined;
  if (/\(\s*the\s+default\s*\)/i.test(comment)) return assignedValue;
  if (/\b(?:the\s+)?default\s+in\b/i.test(comment)) return assignedValue;
  const fromDescription = extractDefaultFromDescription(comment);
  if (fromDescription) return fromDescription;
  const compact = comment.match(/\bdefault\s+(true|false|-?\d+(?:\.\d+)?|[A-Za-z0-9_.:+/-]+)/i);
  if (compact) return cleanValue(compact[1]);
  if (/\bby\s+default\s+disabled\b/i.test(comment)) return "disabled";
  if (/\bby\s+default\s+enabled\b/i.test(comment)) return "enabled";
  return undefined;
}

function extractSourceDefaults(inventory) {
  const defaults = new Map();

  for (const [owner, item] of Object.entries(inventory.items || {})) {
    const files = sourceFilesForItem(item);
    const memberDefaults = new Map();
    const localDefaults = new Map();

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const rawLines = text.split(/\r?\n/);

      for (let index = 0; index < rawLines.length; index++) {
        const line = rawLines[index];
        let match = line.match(/\b(m_[A-Za-z0-9_]+)\s*=\s*([^;]+);/);
        if (match) {
          const value = literalValue(match[2]);
          if (value && !memberDefaults.has(match[1])) {
            memberDefaults.set(match[1], { value, source: file, line: index + 1 });
          }
        }
        match = line.match(/\b(?:bool|int|unsigned\s+int|double|string|std::string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/);
        if (match) {
          const value = literalValue(match[2]);
          if (value && !localDefaults.has(match[1])) {
            localDefaults.set(match[1], { value, source: file, line: index + 1 });
          }
        }
      }

      for (const lineText of extractQuotedLines(text)) {
        const assignment = lineText.match(/^\s*([A-Za-z_][A-Za-z0-9_+:-]*)\s*=\s*([^/]+?)(?:\s*\/\/\s*(.*))?\s*$/);
        if (!assignment) continue;
        const param = assignment[1];
        const assignedValue = cleanValue(assignment[2]);
        const commentDefault = defaultFromComment(assignment[3], assignedValue);
        if (commentDefault) {
          defaults.set(`${owner}:${normalizeName(param)}`, {
            value: commentDefault,
            source: path.relative(REPO_ROOT, file),
            basis: "source example comment"
          });
        }
      }

      for (let index = 0; index < rawLines.length; index++) {
        const line = rawLines[index];
        let match = line.match(/GetConfigurationParam\(\s*"([^"]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/);
        if (match) {
          const param = match[1];
          const variable = match[2];
          const found = memberDefaults.get(variable) || localDefaults.get(variable);
          if (found) {
            defaults.set(`${owner}:${normalizeName(param)}`, {
              value: found.value,
              source: path.relative(REPO_ROOT, found.source),
              line: found.line,
              basis: "source initializer before GetConfigurationParam"
            });
          }
        }

        match = line.match(/param\s*==\s*"([^"]+)"/);
        if (match) {
          const param = match[1];
          const window = rawLines.slice(index, index + 8).join("\n");
          const memberMatch = window.match(/(?:set[A-Za-z0-9_]*OnString\(|\b)(m_[A-Za-z0-9_]+)/);
          if (memberMatch && memberDefaults.has(memberMatch[1])) {
            const found = memberDefaults.get(memberMatch[1]);
            defaults.set(`${owner}:${normalizeName(param)}`, {
              value: found.value,
              source: path.relative(REPO_ROOT, found.source),
              line: found.line,
              basis: "source initializer for parsed parameter"
            });
          }
        }
      }
    }
  }

  return defaults;
}

function synthesizeExample(param, defaultValue) {
  if (defaultValue !== undefined && defaultValue !== "") return `${param} = ${defaultValue}`;
  const lower = param.toLowerCase();
  if (lower.includes("condition")) return `${param} = DEPLOY = true`;
  if (lower.endsWith("flag") || lower.includes("_flag")) return `${param} = EXAMPLE_FLAG = true`;
  if (lower.includes("color")) return `${param} = yellow`;
  if (lower.includes("point")) return `${param} = 0,0`;
  if (lower.includes("speed") || lower.includes("spd")) return `${param} = 1.2`;
  if (lower.includes("range") || lower.includes("radius") || lower.includes("dist")) return `${param} = 10`;
  if (lower.includes("time") || lower.includes("duration") || lower.includes("interval")) return `${param} = 5`;
  if (lower.includes("file")) return `${param} = example.txt`;
  if (lower.includes("path")) return `${param} = ./`;
  return `${param} = example`;
}

function applyManualOverride(entry, override, paramName) {
  if (!override) return;

  if (override.description) entry.description = override.description;
  if (override.example) {
    entry.example = override.example;
    entry.exampleSource = "manual review";
  }
  if (override.exampleTemplate) {
    entry.example = override.exampleTemplate.replace(/\{param\}/g, paramName);
    entry.exampleSource = "manual review";
  }
  if (Object.prototype.hasOwnProperty.call(override, "default")) {
    if (override.default === null) {
      delete entry.default;
      delete entry.defaultSource;
      delete entry.defaultReference;
    } else {
      entry.default = override.default;
      entry.defaultSource = "manual review";
      delete entry.defaultReference;
    }
  }
  if (override.reviewSource) entry.reviewSource = override.reviewSource;
  if (override.reviewNote) entry.reviewNote = override.reviewNote;
}

function globMatches(pattern, value) {
  const normalizedPattern = normalizeName(pattern);
  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function manualOverrideFor(overrides, kind, owner, paramName) {
  const normalizedParam = normalizeName(paramName);

  for (const item of [overrides?.[kind]?.[owner], overrides?.[kind]?.["*"]]) {
    if (!item) continue;
    const direct = item.parameters?.[normalizedParam];
    if (direct) return direct;

    for (const [pattern, override] of Object.entries(item.patterns || {})) {
      if (globMatches(pattern, normalizedParam)) return override;
    }
  }

  return undefined;
}

function applyMetadata(data, examples, sourceDefaults, overrides, kind) {
  let entries = 0;
  let defaults = 0;
  let sourceDefaultCount = 0;
  let examplesApplied = 0;

  for (const [owner, item] of Object.entries(data.items || {})) {
    const ownerOverrides = overrides?.[kind]?.[owner];
    const excluded = new Set((ownerOverrides?.excludedParameters || []).map(normalizeName));
    for (const key of Object.keys(item.parameters || {})) {
      const paramName = item.parameters[key].name || key;
      if (excluded.has(normalizeName(paramName))) {
        delete item.parameters[key];
      }
    }

    for (const [key, entry] of Object.entries(item.parameters || {})) {
      const paramName = entry.name || key;
      const lookupKey = `${owner}:${normalizeName(paramName)}`;
      const docDefault = extractDefaultFromDescription(entry.description);
      const sourceDefault = sourceDefaults.get(lookupKey);
      const defaultValue = sourceDefault?.value || docDefault;

      if (defaultValue !== undefined && defaultValue !== "") {
        entry.default = defaultValue;
        entry.defaultSource = sourceDefault ? sourceDefault.basis : "documentation text";
          if (sourceDefault?.source) entry.defaultReference = sourceDefault.line
            ? `${sourceDefault.source}:${sourceDefault.line}`
            : sourceDefault.source;
        defaults++;
        if (sourceDefault) sourceDefaultCount++;
      }

      entry.example = examples.get(lookupKey) || synthesizeExample(paramName, defaultValue);
      entry.exampleSource = examples.has(lookupKey) ? "generated coverage fixture" : "generated from parameter name";
      applyManualOverride(entry, manualOverrideFor(overrides, kind, owner, paramName), paramName);
      examplesApplied++;
      entries++;
    }
  }

  const parameters = {};
  for (const [owner, item] of Object.entries(data.items || {})) {
    for (const [key, entry] of Object.entries(item.parameters || {})) {
      if (!parameters[key]) parameters[key] = [];
      parameters[key].push({
        owner,
        description: entry.description,
        ...(entry.doc ? { doc: entry.doc } : {}),
        ...(entry.source ? { source: entry.source } : {}),
        ...(entry.basis ? { basis: entry.basis } : {}),
        ...(entry.sourceStatus ? { sourceStatus: entry.sourceStatus } : {}),
        ...(entry.default !== undefined ? { default: entry.default } : {}),
        ...(entry.defaultSource ? { defaultSource: entry.defaultSource } : {}),
        ...(entry.defaultReference ? { defaultReference: entry.defaultReference } : {}),
        ...(entry.example ? { example: entry.example } : {}),
        ...(entry.exampleSource ? { exampleSource: entry.exampleSource } : {}),
        ...(entry.reviewSource ? { reviewSource: entry.reviewSource } : {}),
        ...(entry.reviewNote ? { reviewNote: entry.reviewNote } : {}),
        ...(item.aliasOf ? { aliasOf: item.aliasOf } : {})
      });
    }
  }
  for (const entriesForParam of Object.values(parameters)) {
    entriesForParam.sort((a, b) => a.owner.localeCompare(b.owner));
  }
  data.parameters = Object.fromEntries(Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)));

  return { entries, defaults, sourceDefaultCount, examplesApplied };
}

const moosInventory = loadJson("data/moos-inventory.json");
const bhvInventory = loadJson("data/bhv-inventory.json");
const moosExamples = parseExampleLines(path.join(REPO_ROOT, "examples", "all_apps.moos"), /^\s*ProcessConfig\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/);
const bhvExamples = parseExampleLines(path.join(REPO_ROOT, "examples", "all_behaviors.bhv"), /^\s*Behavior\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/);
const moosDefaults = extractSourceDefaults(moosInventory);
const bhvDefaults = extractSourceDefaults(bhvInventory);

const moosDocs = loadJson("data/moos-docs.json");
const moosSource = loadJson("data/moos-source.json");
const bhvDocs = loadJson("data/bhv-docs.json");
const bhvSource = loadJson("data/bhv-source.json");
const manualOverrides = loadOptionalJson("data/parameter-overrides.json");

const results = {
  moosDocs: applyMetadata(moosDocs, moosExamples, moosDefaults, manualOverrides, "moos"),
  moosSource: applyMetadata(moosSource, moosExamples, moosDefaults, manualOverrides, "moos"),
  bhvDocs: applyMetadata(bhvDocs, bhvExamples, bhvDefaults, manualOverrides, "ivp-behavior"),
  bhvSource: applyMetadata(bhvSource, bhvExamples, bhvDefaults, manualOverrides, "ivp-behavior")
};

writeJson("data/moos-docs.json", moosDocs);
writeJson("data/moos-source.json", moosSource);
writeJson("data/bhv-docs.json", bhvDocs);
writeJson("data/bhv-source.json", bhvSource);

console.log(JSON.stringify({
  sourceDefaults: {
    moos: moosDefaults.size,
    bhv: bhvDefaults.size
  },
  results
}, null, 2));
