const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const MOOS_ROOT = process.env.MOOS_IVP_ROOT || "/Users/charlesbenjamin/moos-ivp";
const SRC_ROOT = path.join(MOOS_ROOT, "ivp", "src");
const PDF_INDEX = "https://oceanai.mit.edu/ivpman/pdfs/";
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "ivpman-pdfs");
const inactiveAppFamilyMembers = new Set([
  "pMarinePID",
  "uSimMarine",
  "uSimMarineV23"
]);
const inactiveBehaviorFamilyMembers = new Set([
  "BHV_AvdColregsV17",
  "BHV_AvdColregsV19",
  "BHV_OpRegion"
]);

const appAliases = {
  app_pantler: "ANTLER",
  app_pmviewer: "pMarineViewer",
  app_pnreporter: "pNodeReporter",
  app_usimmarine: "uSimMarine",
  app_usimmarine_v22: "uSimMarineV22",
  app_utscript: "uTimerScript"
};

const appDocAliases = {
  uFldPathCheck: "uFldPathCheck",
  uFldScope: "uFldScope",
  uTermCommand: "uTimerScript"
};

const behaviorAliases = {
  bhv_avdcol: "BHV_AvoidCollision",
  bhv_colregs: "BHV_AvdColregsV22",
  bhv_const_depth: "BHV_ConstantDepth",
  bhv_const_hdg: "BHV_ConstantHeading",
  bhv_const_speed: "BHV_ConstantSpeed",
  bhv_cutrange: "BHV_CutRange",
  bhv_fixedturn: "BHV_FixedTurn",
  bhv_goto_depth: "BHV_GoToDepth",
  bhv_legrun: "BHV_LegRun",
  bhv_loiter: "BHV_Loiter",
  bhv_max_depth: "BHV_MaxDepth",
  bhv_mem_turnlimit: "BHV_MemoryTurnLimit",
  bhv_muster: "BHV_Muster",
  bhv_opregion: "BHV_OpRegion",
  bhv_opregion_v24: "BHV_OpRegionV24",
  bhv_periodic_speed: "BHV_PeriodicSpeed",
  bhv_periodic_surface: "BHV_PeriodicSurface",
  bhv_shadow: "BHV_Shadow",
  bhv_stationkeep: "BHV_StationKeep",
  bhv_task_muster: "BHV_TaskMuster",
  bhv_task_wpt: "BHV_TaskWaypoint",
  bhv_testfail: "BHV_TestFailure",
  bhv_timer: "BHV_Timer",
  bhv_trail: "BHV_Trail",
  bhv_waypoint: "BHV_Waypoint",
  bhv_zigzag: "BHV_ZigZag",
  bhv_avoid_obstacle: "BHV_AvoidObstacle",
  bhv_convoy: "BHV_Convoy"
};

const behaviorDocAliases = {
  BHV_AvoidObstacleV24: "BHV_AvoidObstacle",
  BHV_ConvoyV21: "BHV_Convoy",
  BHV_ConvoyV21X: "BHV_Convoy",
  BHV_LegRunX: "BHV_LegRun",
  BHV_LegRunZ: "BHV_LegRun",
  BHV_MaxSpeed: "BHV_ConstantSpeed",
  BHV_MusterX: "BHV_Muster",
  BHV_OpRegionRecover: "BHV_OpRegionV24",
  BHV_TaskConvoy: "BHV_Convoy"
};

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 128 * 1024 * 1024,
    ...options
  });
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

function slugToCamel(prefix, slug) {
  const raw = slug.replace(new RegExp(`^${prefix}_`), "");
  return raw.split("_").map((part, index) => {
    if (index === 0) return part[0] + part.slice(1);
    return part[0].toUpperCase() + part.slice(1);
  }).join("");
}

function slugToBehavior(slug) {
  return `BHV_${slug.replace(/^bhv_/, "").split("_").map((part) => (
    part ? part[0].toUpperCase() + part.slice(1) : part
  )).join("")}`;
}

function normalizeParamName(name) {
  return name
    .trim()
    .replace(/[.。]+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .toLowerCase();
}

function normalizeDescription(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s*\[more\]\s*\.?/gi, "")
    .replace(/\bIt true\b/g, "If true")
    .replace(/\bdefault it false\b/gi, "default is false")
    .replace(/\bdefault it true\b/gi, "default is true")
    .replace(/\bvehavior\b/gi, "behavior")
    .replace(/\bcontac’ts\b/gi, "contact's")
    .replace(/\bregins\b/gi, "regions")
    .replace(/\bpolylgons\b/gi, "polygons")
    .replace(/\bevern\b/gi, "every")
    .replace(/\binteration\b/gi, "iteration")
    .replace(/\bteh\b/gi, "the")
    .replace(/\baltnernate\b/gi, "alternate")
    .replace(/\bvaluesdeviating\b/gi, "values deviating")
    .replace(/\buses cases\b/gi, "use cases")
    .replace(/\bre-\s+setting\b/gi, "resetting")
    .replace(/\s+(?:See\s+)?Section\s+\?+\.?/gi, "")
    .replace(/\s+(?:See\s+)?Section\s+\d+(?:\.\d+)*\.?/gi, "")
    .replace(/\s+\(Introduced after release [^)]+\)\.?/gi, "")
    .replace(/\s+Introduced after Release [^.]+\.?/gi, "")
    .replace(/\s+id:\s*$/gi, "")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstSentences(text, maxSentences = 2, maxLength = 360) {
  const clean = normalizeDescription(text);
  if (!clean) return "";

  const sentences = clean.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [clean];
  let out = sentences.slice(0, maxSentences).join(" ").trim();
  if (out.length > maxLength) {
    out = `${out.slice(0, maxLength).replace(/\s+\S*$/, "")}.`;
  }
  return out;
}

function extractItemDescription(text, itemName, kind) {
  const lines = text.replace(/\r/g, "").split("\n");
  let contentsLine = lines.findIndex((line) => line.trim() === "Contents");
  if (contentsLine === -1) contentsLine = 0;

  const escapedItem = escapeRegExp(itemName.replace(/^BHV_/, ""));
  const headingPatterns = kind === "app"
    ? [
        /^1\s+Overview$/i,
        new RegExp(`^1\\s+.*${escapeRegExp(itemName)}.*$`, "i")
      ]
    : [
        /^1\s+.+Behavior$/i,
        new RegExp(`^1\\s+.*${escapedItem}.*Behavior.*$`, "i")
      ];

  let start = -1;
  for (let index = contentsLine + 1; index < lines.length; index++) {
    if (/\.{3,}/.test(lines[index]) || /\s{2,}\d+\s*$/.test(lines[index])) {
      continue;
    }
    const compact = lines[index].replace(/\f/g, "").trim().replace(/\s+/g, " ");
    if (headingPatterns.some((pattern) => pattern.test(compact))) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return "";

  const chunks = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index].replace(/\f/g, "").trim();
    if (!line) {
      if (chunks.length) break;
      continue;
    }
    if (chunks.length && /^(?:\d+(?:\.\d+)+|\d+)\s+[A-Z]/.test(line)) break;
    if (chunks.length && /^(?:Listing|Figure)\s+\d/i.test(line)) break;
    if (/^(?:Contents|\d+)$/.test(line)) continue;
    if (/\.{4,}/.test(line)) continue;
    chunks.push(line);
  }

  return firstSentences(chunks.join(" "));
}

function addParam(item, param, description, docUrl) {
  if (!param || !description) return;
  if (!item.parameters[param] || description.length > item.parameters[param].description.length) {
    item.parameters[param] = { description, doc: docUrl };
  }
}

function fetchIndex() {
  return run("curl", ["-L", "--fail", "--silent", PDF_INDEX]);
}

function parsePdfNames(indexHtml) {
  const names = [];
  const regex = /href="([^"]+\.pdf)"/g;
  let match;
  while ((match = regex.exec(indexHtml)) !== null) {
    if (/^(app|bhv)_/.test(match[1])) names.push(match[1]);
  }
  return names.sort();
}

function pdfText(pdfName) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const pdfPath = path.join(CACHE_DIR, pdfName);
  if (!fs.existsSync(pdfPath)) {
    run("curl", ["-L", "--fail", "--silent", "-o", pdfPath, `${PDF_INDEX}${pdfName}`]);
  }
  return run("pdftotext", ["-layout", pdfPath, "-"]);
}

function guessItemName(pdfName, kind, text) {
  const slug = pdfName.replace(/\.pdf$/, "");
  const aliases = kind === "app" ? appAliases : behaviorAliases;
  if (aliases[slug]) return aliases[slug];

  const appMatch = text.match(/Configuration Parameters (?:for|of)\s+([A-Za-z][A-Za-z0-9_]*)/i);
  if (appMatch) return appMatch[1];

  const behaviorMatch = text.match(/Configuration Parameters (?:for|of)(?: the)?\s+(.+?)\s+Behavior/i);
  if (behaviorMatch) {
    return `BHV_${behaviorMatch[1].replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).map((part) => (
      part ? part[0].toUpperCase() + part.slice(1) : part
    )).join("")}`;
  }

  if (kind === "app") return slugToCamel("app", slug);
  return slugToBehavior(slug);
}

function extractListingBlocks(text) {
  const blocks = [];
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  let current = [];

  for (const line of lines) {
    if (/Listing\s+\d+(?:\.\d+)?:\s+Configuration Parameters/i.test(line)) {
      if (current.length) blocks.push(current);
      current = [];
      inBlock = true;
      continue;
    }

    if (!inBlock) continue;

    if (/Listing\s+\d+(?:\.\d+)?:/.test(line) && !/Configuration Parameters/i.test(line)) {
      if (current.length) blocks.push(current);
      current = [];
      inBlock = false;
      continue;
    }

    if (/^\s*(\d+(?:\.\d+)*)\s+[A-Z][A-Za-z]/.test(line) && current.length > 4) {
      blocks.push(current);
      current = [];
      inBlock = false;
      continue;
    }

    current.push(line);
  }

  if (current.length) blocks.push(current);
  return blocks;
}

function parseParameterBlock(lines) {
  const entries = {};
  let active = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\f/g, "");
    if (!line.trim()) continue;
    if (/^\s*(Parameter\s+Description|\/\/|#)/i.test(line)) continue;
    if (/^\s*\d+\s*$/.test(line)) continue;

    const colonMatch = line.match(/^\s{0,24}([A-Za-z][A-Za-z0-9 _-]{1,40}?):\s+(.*)$/);
    if (colonMatch) {
      const param = normalizeParamName(colonMatch[1]);
      const desc = normalizeDescription(colonMatch[2]);
      if (param && desc && !/^(listing|section|figure|the|in|or|and|default)$/.test(param)) {
        active = param;
        entries[active] = entries[active] ? `${entries[active]} ${desc}` : desc;
      }
      continue;
    }

    const columnMatch = line.match(/^\s{0,24}([A-Za-z][A-Za-z0-9 _-]{1,40}?)\s{2,}([A-Z0-9"].*)$/);
    if (columnMatch) {
      const param = normalizeParamName(columnMatch[1]);
      const desc = normalizeDescription(columnMatch[2]);
      if (param && desc && !/^(parameter|default)$/.test(param)) {
        active = param;
        entries[active] = entries[active] ? `${entries[active]} ${desc}` : desc;
      }
      continue;
    }

    if (active && /^\s{12,}\S/.test(line)) {
      entries[active] = normalizeDescription(`${entries[active]} ${line.trim()}`);
    }
  }

  return entries;
}

function buildDocs(kind, pdfNames) {
  const items = {};
  const parameters = {};

  for (const pdfName of pdfNames) {
    const docUrl = `${PDF_INDEX}${pdfName}`;
    let text;
    try {
      text = pdfText(pdfName);
    } catch (error) {
      continue;
    }

    const itemName = guessItemName(pdfName, kind, text);
    const item = items[itemName] || { doc: docUrl, parameters: {} };
    const description = extractItemDescription(text, itemName, kind);
    if (description && (!item.description || description.length > item.description.length)) {
      item.description = description;
    }
    for (const block of extractListingBlocks(text)) {
      const entries = parseParameterBlock(block);
      for (const [param, description] of Object.entries(entries)) {
        addParam(item, param, description, docUrl);
      }
    }
    if (Object.keys(item.parameters).length) items[itemName] = item;
  }

  for (const [owner, item] of Object.entries(items)) {
    for (const [param, entry] of Object.entries(item.parameters)) {
      if (!parameters[param]) parameters[param] = [];
      parameters[param].push({ owner, description: entry.description, doc: entry.doc });
    }
  }

  for (const entries of Object.values(parameters)) {
    entries.sort((a, b) => a.owner.localeCompare(b.owner));
  }

  return {
    generatedFrom: {
      index: PDF_INDEX
    },
    items: Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b))),
    parameters: Object.fromEntries(Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)))
  };
}

function localSourceBackedApps() {
  const apps = new Set(["ANTLER", "MOOSDB"]);
  if (fs.existsSync(SRC_ROOT)) {
    for (const entry of fs.readdirSync(SRC_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name.startsWith("dep_") ? entry.name.slice(4) : entry.name;
      if (inactiveAppFamilyMembers.has(name)) continue;
      if (/^[pui][A-Z]/.test(name)) apps.add(name);
    }
  }

  const coreMoosApps = {
    pLogger: path.join(MOOS_ROOT, "MOOS_Jul2724", "MOOSEssentials", "Essentials", "pLogger"),
    pShare: path.join(MOOS_ROOT, "MOOS_Jul2724", "MOOSEssentials", "Essentials", "pShare")
  };
  for (const [app, dir] of Object.entries(coreMoosApps)) {
    if (fs.existsSync(dir)) apps.add(app);
  }
  return apps;
}

function localSourceBackedBehaviors() {
  const behaviors = new Set();
  if (!fs.existsSync(SRC_ROOT)) {
    return behaviors;
  }

  for (const file of walk(SRC_ROOT, (candidate) => /BHV_[A-Za-z0-9_]+\.cpp$/.test(candidate))) {
    if (file.includes(`${path.sep}lib_dep_behaviors${path.sep}`)) {
      continue;
    }
    const behavior = path.basename(file, ".cpp");
    if (inactiveBehaviorFamilyMembers.has(behavior)) continue;
    behaviors.add(behavior);
  }

  return behaviors;
}

function filterDocsToItems(docs, allowedItems) {
  docs.items = Object.fromEntries(
    Object.entries(docs.items).filter(([owner]) => allowedItems.has(owner))
  );

  const parameters = {};
  for (const [owner, item] of Object.entries(docs.items)) {
    for (const [param, entry] of Object.entries(item.parameters)) {
      if (!parameters[param]) parameters[param] = [];
      parameters[param].push({
        owner,
        description: entry.description,
        doc: entry.doc,
        ...(item.aliasOf ? { aliasOf: item.aliasOf } : {})
      });
    }
  }

  for (const entries of Object.values(parameters)) {
    entries.sort((a, b) => a.owner.localeCompare(b.owner));
  }
  docs.items = Object.fromEntries(Object.entries(docs.items).sort(([a], [b]) => a.localeCompare(b)));
  docs.parameters = Object.fromEntries(Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)));
}

function applyDocAliases(docs, aliases) {
  for (const [alias, target] of Object.entries(aliases)) {
    if (!docs.items[alias] && docs.items[target]) {
      docs.items[alias] = {
        ...docs.items[target],
        aliasOf: target
      };
      for (const [param, entry] of Object.entries(docs.items[alias].parameters)) {
        if (!docs.parameters[param]) docs.parameters[param] = [];
        if (!docs.parameters[param].some((existing) => existing.owner === alias)) {
          docs.parameters[param].push({
            owner: alias,
            description: entry.description,
            doc: entry.doc,
            aliasOf: target
          });
        }
      }
    }
  }

  for (const entries of Object.values(docs.parameters)) {
    entries.sort((a, b) => a.owner.localeCompare(b.owner));
  }
  docs.items = Object.fromEntries(Object.entries(docs.items).sort(([a], [b]) => a.localeCompare(b)));
  docs.parameters = Object.fromEntries(Object.entries(docs.parameters).sort(([a], [b]) => a.localeCompare(b)));
}

const pdfNames = parsePdfNames(fetchIndex());
const appDocs = buildDocs("app", pdfNames.filter((name) => name.startsWith("app_")));
const bhvDocs = buildDocs("behavior", pdfNames.filter((name) => name.startsWith("bhv_")));
applyDocAliases(appDocs, appDocAliases);
applyDocAliases(bhvDocs, behaviorDocAliases);
filterDocsToItems(appDocs, localSourceBackedApps());
filterDocsToItems(bhvDocs, localSourceBackedBehaviors());

fs.mkdirSync(path.join(REPO_ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(REPO_ROOT, "data", "moos-docs.json"), `${JSON.stringify(appDocs, null, 2)}\n`);
fs.writeFileSync(path.join(REPO_ROOT, "data", "bhv-docs.json"), `${JSON.stringify(bhvDocs, null, 2)}\n`);

console.log(`appDocs=${Object.keys(appDocs.items).length}`);
console.log(`appDocParameters=${Object.keys(appDocs.parameters).length}`);
console.log(`behaviorDocs=${Object.keys(bhvDocs.items).length}`);
console.log(`behaviorDocParameters=${Object.keys(bhvDocs.parameters).length}`);
