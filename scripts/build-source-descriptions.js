const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MOOS_ROOT = process.env.MOOS_IVP_ROOT || "/Users/charlesbenjamin/moos-ivp";

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

function normalizeName(name) {
  return name.toLowerCase().replace(/-/g, "_");
}

function humanize(name) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeDescription(text) {
  return text
    .replace(/\be\.g,?\s*/gi, "for example, ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
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

function extractQuotedLines(text) {
  const lines = [];
  const regex = /(?:blk|blu|mag|cyn|grn)\("((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    lines.push(match[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\").trim());
  }
  return lines;
}

function sourceFilesForItem(item) {
  const files = new Set();
  for (const source of item.sources || []) {
    if (source.includes("editor-modes")) continue;
    const full = path.resolve(REPO_ROOT, source);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) {
      for (const file of walk(full, (candidate) => /_Info\.(cpp|h|hpp)$/.test(candidate))) {
        files.add(file);
      }
      continue;
    }
    files.add(full);
  }
  return Array.from(files).sort();
}

function synopsisFromInfoFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/void\s+showSynopsis\s*\(\s*\)\s*\{([\s\S]*?)\n\}/);
  if (!match) return "";

  const lines = extractQuotedLines(match[1]).filter((line) => (
    line
    && !/^SYNOPSIS:?$/i.test(line)
    && !/^-+$/.test(line)
  ));
  return firstSentences(lines.join(" "));
}

function sourceSynopsis(item) {
  for (const file of sourceFilesForItem(item)) {
    const description = synopsisFromInfoFile(file);
    if (description) return description;
  }
  return "";
}

const sourceOnlyAppDescriptions = {
  iBlinkStick: "Interfaces with BlinkStick USB LEDs so missions can display status or alert indications.",
  uCommand: "Provides a GUI for posting configured command variables into a MOOS community.",
  pMapMarkers: "Consumes marker configuration and posts visual marker objects for display in marine viewers.",
  pXRelay: "Relays configured MOOS variable posts between source and destination variables.",
  uFldDelve: "Provides field-test support for inspecting and interacting with MOOS variables during a mission.",
  uFldGenericSensor: "Simulates configurable sensor reports for fielded multi-vehicle missions.",
  uMemWatch: "Monitors process memory usage and reports memory-related status through MOOS.",
  uPlotViewer: "Displays plotted MOOS data from mission logs or live mission streams."
};

const sourceOnlyBehaviorDescriptions = {
  BHV_AbortToPoint: "IvP behavior that drives the vehicle toward a configured point when an abort-style condition is active.",
  BHV_BearingLine: "IvP behavior that steers relative to a configured bearing line.",
  BHV_FullStop: "IvP behavior that brings the vehicle to a stop and can post completion flags when stopped.",
  BHV_Guide: "IvP behavior used by the behavior web tooling to guide vehicle motion from web-provided commands.",
  BHV_Guide_Info: "Behavior web helper entry that documents the BHV_Guide configuration interface.",
  BHV_HeadingBias: "IvP behavior that biases the helm toward a preferred heading.",
  BHV_HeadingChange: "IvP behavior that commands a temporary heading change maneuver.",
  BHV_HeadingHysteresis: "IvP behavior that uses heading hysteresis to avoid rapid heading-switching decisions.",
  BHV_HSLine: "IvP behavior for following or responding to a heading-speed line objective.",
  BHV_Hysteresis: "IvP behavior that applies hysteresis so helm decisions do not oscillate rapidly.",
  BHV_MaintainHeading: "IvP behavior that holds the vehicle near a desired heading.",
  BHV_MinAltitudeX: "IvP behavior that protects a minimum altitude constraint.",
  BHV_PModelView: "IvP behavior that publishes pieces of the behavior model for visualization.",
  BHV_RangePulse: "IvP behavior that generates range-pulse visualizations around the vehicle.",
  BHV_RStationKeep: "IvP behavior that keeps the vehicle near a station point with range-based control.",
  BHV_TimeOut: "IvP behavior that completes or posts flags after a configured timeout."
};

function generatedItemDescription(owner, kind) {
  const phrase = humanize(owner.replace(/^BHV_/, ""));
  if (kind === "moos") {
    return sourceOnlyAppDescriptions[owner] || `${owner} is a MOOS app or utility for ${phrase.toLowerCase()} mission support.`;
  }
  return sourceOnlyBehaviorDescriptions[owner] || `${owner} is an IvP behavior for ${phrase.toLowerCase()} control.`;
}

function isUsefulItemDescription(description) {
  return Boolean(description)
    && description.length >= 48
    && !/\b(?:for|to|from|with|and|or)$/i.test(description);
}

function itemDescription(owner, item, docs, curated, kind) {
  const candidates = [
    docs.items?.[owner]?.description,
    curated.apps?.[owner],
    curated.behaviors?.[owner],
    sourceSynopsis(item),
    kind === "moos" ? sourceOnlyAppDescriptions[owner] : sourceOnlyBehaviorDescriptions[owner],
    generatedItemDescription(owner, kind)
  ];
  return candidates.find(isUsefulItemDescription) || generatedItemDescription(owner, kind);
}

function addParam(item, index, owner, param, description, source, basis, sourceStatus) {
  item.parameters[normalizeName(param)] = {
    name: param,
    description,
    source,
    basis,
    sourceStatus
  };

  const key = normalizeName(param);
  if (!index[key]) index[key] = [];
  index[key].push({ owner, description, source, basis, sourceStatus });
}

function hasExactDoc(docs, owner, param) {
  return Boolean(docs.items?.[owner]?.parameters?.[normalizeName(param)]);
}

function hasCurated(curated, param) {
  return Boolean(curated.parameters?.[param] || curated.parameters?.[normalizeName(param)]);
}

function primarySource(item) {
  const sources = item.sources || [];
  const source = sources.find((entry) => !entry.includes("editor-modes")) || sources[0];
  if (!source) return path.relative(REPO_ROOT, MOOS_ROOT);
  return source;
}

function basisFor(item) {
  if (item.sourceStatus === "local-ivp-source") {
    return "generated from local MOOS-IvP ivp/src source inventory";
  }
  if (item.sourceStatus === "local-moos-source") {
    return "generated from bundled MOOS source in the local MOOS-IvP checkout";
  }
  if (item.sourceStatus === "editor-mode-inventory") {
    return "generated from upstream editor-mode keyword inventory; no matching local source was found";
  }
  return "generated from MOOS-IvP inventory naming";
}

function appDescription(owner, param) {
  const lower = normalizeName(param);
  const phrase = humanize(param);

  if (lower === "apptick") return `Target iterate rate for ${owner}, in Hertz.`;
  if (lower === "commstick") return `Target MOOS communications rate for ${owner}, in Hertz.`;
  if (lower === "max_appcast_events") return `Maximum number of appcast events retained for ${owner} reports.`;
  if (lower === "app_logging") return `Controls app-level logging for ${owner}.`;
  if (lower === "verbose") return `Controls verbose terminal or appcast reporting for ${owner}.`;
  if (lower === "paused") return `Starts or keeps ${owner} in a paused state when supported.`;
  if (lower.startsWith("flip:")) return `Flip mapping stanza used by ${owner} to transform fields from a source variable into a destination variable.`;
  if (lower === "action+") return `Additional pMarineViewer action binding, typically used for operator-triggered MOOS posts.`;
  if (lower === "condition") return `MOOS logic condition used by ${owner} to gate an action.`;
  if (lower === "cmd") return `Command string or command-posting configuration consumed by ${owner}.`;
  if (lower === "poke") return `MOOS variable-value poke configured for ${owner}.`;
  if (lower.startsWith("post_")) return `If true, ${owner} posts or enables the ${humanize(param)} output.`;
  if (lower === "input") return `Input route or source configuration for ${owner}.`;
  if (lower === "output") return `Output route or destination configuration for ${owner}.`;
  if (lower === "watch" || lower === "watch_all") return `Process or variable watch rule used by ${owner}.`;
  if (lower === "nowatch") return `Exclusion rule for the watch list used by ${owner}.`;
  if (lower.includes("hostip") || lower === "ip_addr") return `Host/IP address selection setting for ${owner}.`;
  if (lower === "port") return `Network port setting for ${owner}.`;
  if (lower.includes("comms_type")) return `Communications transport type used by ${owner}.`;
  if (lower.includes("prefix")) return `MOOS variable prefix used by ${owner}.`;
  if (lower.includes("stale")) return `Staleness threshold or stale-data handling setting for ${owner}.`;
  if (lower.includes("thresh") || lower.includes("threshold")) return `Threshold value used by ${owner} when deciding whether to trigger or warn.`;
  if (lower.includes("range") || lower.includes("dist") || lower.includes("distance") || lower.includes("radius")) return `Range, distance, or radius setting used by ${owner}.`;
  if (lower.includes("color") || lower.includes("colour")) return `Visual color setting used by ${owner}.`;
  if (lower.includes("shape")) return `Visual shape setting used by ${owner}.`;
  if (lower.includes("transparency") || lower.includes("trans")) return `Visual transparency setting used by ${owner}.`;
  if (lower.includes("size") || lower.includes("width") || lower.includes("length")) return `Size, width, or length setting used by ${owner}.`;
  if (lower.includes("file") || lower.includes("path") || lower.includes("dir")) return `File or directory path setting used by ${owner}.`;
  if (lower.includes("flag") || lower.includes("post")) return `MOOS variable-value post configured for ${owner}.`;
  if (lower.includes("var")) return `MOOS variable name used by ${owner}.`;
  if (lower.includes("group") || lower.includes("type") || lower.includes("name")) return `Filter, identity, or classification setting used by ${owner}.`;
  if (lower.includes("ignore") || lower.includes("reject")) return `Exclusion or rejection rule used by ${owner}.`;
  if (lower.includes("match")) return `Matching rule used by ${owner}.`;
  if (lower.includes("display") || lower.includes("show") || lower.includes("view")) return `Display control setting used by ${owner}.`;
  if (lower.includes("speed") || lower.includes("spd")) return `Speed-related setting used by ${owner}.`;
  if (lower.includes("heading") || lower.includes("hdg")) return `Heading-related setting used by ${owner}.`;
  if (lower.includes("depth")) return `Depth-related setting used by ${owner}.`;
  if (lower.includes("time") || lower.includes("interval") || lower.includes("duration") || lower.includes("delay")) return `Timing, interval, or duration setting used by ${owner}.`;
  if (lower.includes("poly") || lower.includes("polygon") || lower.includes("region")) return `Polygon or operating-region setting used by ${owner}.`;
  if (
    lower === "x" || lower === "y" ||
    /(?:^|_)(?:x|y)$/.test(lower) ||
    /^(?:os|pt|cn)[xy]$/.test(lower) ||
    lower.includes("lat") ||
    lower.includes("lon")
  ) return `Position or coordinate setting used by ${owner}.`;
  return `Configures the ${phrase} setting for ${owner}.`;
}

function behaviorDescription(owner, param) {
  const lower = normalizeName(param);
  const phrase = humanize(param);

  if (lower === "name") return `Unique name for this ${owner} instance.`;
  if (lower === "ipf_type") return `IvP function construction style used by ${owner}, such as ZAIC or reflector-based generation.`;
  if (lower === "pwt" || lower === "priority") return `Priority weight used by the IvP Helm for this ${owner} instance.`;
  if (lower === "condition") return `MOOS logic condition that must hold for this ${owner} instance to run.`;
  if (lower === "updates") return `MOOS variable used for runtime updates to this ${owner} instance.`;
  if (lower === "duration") return `Duration limit or duration setting for this ${owner} instance.`;
  if (lower === "perpetual") return `Controls whether this ${owner} instance can complete or remains available.`;
  if (lower === "templating") return `Controls template behavior handling for this ${owner} configuration.`;
  if (lower.endsWith("flag") || lower.includes("_flag")) return `MOOS variable-value flag posted by this ${owner} instance.`;
  if (lower === "visual_hints") return `Visual rendering hints posted by this ${owner} instance.`;
  if (lower.includes("post_mapping")) return `Maps behavior output posts to alternate MOOS variables.`;
  if (lower.includes("contact") || lower === "them") return `Contact target or contact filtering setting used by ${owner}.`;
  if (lower.includes("extrapolate") || lower.includes("decay")) return `Contact extrapolation or stale-contact decay setting used by ${owner}.`;
  if (lower.includes("match") || lower.includes("ignore") || lower.includes("filter")) return `Contact or region filtering rule used by ${owner}.`;
  if (lower.includes("range") || lower.includes("dist") || lower.includes("radius")) return `Range, distance, or radius threshold used by ${owner}.`;
  if (lower.includes("speed") || lower.includes("spd")) return `Speed-related setting used by ${owner}.`;
  if (lower.includes("heading") || lower.includes("hdg") || lower.includes("course") || lower.includes("crs")) return `Heading or course setting used by ${owner}.`;
  if (lower.includes("depth") || lower.includes("altitude")) return `Depth or altitude setting used by ${owner}.`;
  if (lower.includes("polygon") || lower.includes("poly") || lower.includes("region")) return `Polygon or operating-region setting used by ${owner}.`;
  if (lower.includes("point") || lower.includes("lat") || lower.includes("lon") || lower === "ptx" || lower === "pty" || lower === "osx" || lower === "osy") return `Point or coordinate setting used by ${owner}.`;
  if (lower.includes("time") || lower.includes("duration") || lower.includes("delay") || lower.includes("interval")) return `Timing, interval, or delay setting used by ${owner}.`;
  if (lower.includes("turn") || lower.includes("zig") || lower.includes("zag")) return `Turn or maneuver-shaping setting used by ${owner}.`;
  if (lower.includes("lead") || lower.includes("capture") || lower.includes("slip")) return `Waypoint/trackline capture setting used by ${owner}.`;
  if (lower.includes("zaic") || lower.includes("basewidth") || lower.includes("peakwidth") || lower.includes("summit")) return `IvP objective-function shaping setting used by ${owner}.`;
  if (lower.includes("color") || lower.includes("label") || lower.includes("show") || lower.includes("draw")) return `Visual display setting used by ${owner}.`;
  if (lower.includes("var")) return `MOOS variable name used by ${owner}.`;
  return `Configures the ${phrase} setting for ${owner}.`;
}

function buildSourceDescriptions(kind) {
  const isMoos = kind === "moos";
  const inventory = loadJson(isMoos ? "data/moos-inventory.json" : "data/bhv-inventory.json");
  const docs = loadJson(isMoos ? "data/moos-docs.json" : "data/bhv-docs.json");
  const curated = loadJson(isMoos ? "data/moos-language.json" : "data/bhv-language.json");
  const describe = isMoos ? appDescription : behaviorDescription;

  const items = {};
  const parameters = {};
  let generatedPairs = 0;

  for (const [owner, item] of Object.entries(inventory.items || {})) {
    const source = primarySource(item);
    const basis = basisFor(item);
    const outputItem = {
      source,
      description: itemDescription(owner, item, docs, curated, kind),
      sourceStatus: item.sourceStatus || "unknown",
      parameters: {}
    };

    for (const param of item.parameters || []) {
      if (hasExactDoc(docs, owner, param) || hasCurated(curated, param)) continue;
      addParam(
        outputItem,
        parameters,
        owner,
        param,
        describe(owner, param),
        source,
        basis,
        item.sourceStatus || "unknown"
      );
      generatedPairs++;
    }

    if (Object.keys(outputItem.parameters).length) {
      items[owner] = outputItem;
    }
  }

  for (const entries of Object.values(parameters)) {
    entries.sort((a, b) => a.owner.localeCompare(b.owner));
  }

  return {
    generatedFrom: {
      moosIvP: MOOS_ROOT
    },
    generatedPairs,
    items: Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b))),
    parameters: Object.fromEntries(Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)))
  };
}

const moos = buildSourceDescriptions("moos");
const bhv = buildSourceDescriptions("bhv");

fs.mkdirSync(path.join(REPO_ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(REPO_ROOT, "data", "moos-source.json"), `${JSON.stringify(moos, null, 2)}\n`);
fs.writeFileSync(path.join(REPO_ROOT, "data", "bhv-source.json"), `${JSON.stringify(bhv, null, 2)}\n`);

console.log(`moosSourcePairs=${moos.generatedPairs}`);
console.log(`bhvSourcePairs=${bhv.generatedPairs}`);
