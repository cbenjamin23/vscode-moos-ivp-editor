const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MOOS_ROOT = process.env.MOOS_IVP_ROOT || "/Users/charlesbenjamin/moos-ivp";
const SRC_ROOT = path.join(MOOS_ROOT, "ivp", "src");
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
const behaviorParameterExclusions = {
  BHV_AbortToPoint: new Set([
    "desired_speed",
    "osx",
    "osy",
    "ptx",
    "pty"
  ]),
  BHV_AvdColregsV22: new Set([
    "exit_on_filter_vname"
  ]),
  BHV_AvoidCollision: new Set([
    "exit_on_filter_vname",
    "ignore_contact_group",
    "match_contact_group",
    "them"
  ]),
  BHV_AvoidObstacleV24: new Set([
    "no_alert_request",
    "obstacle_key"
  ]),
  BHV_CutRange: new Set([
    "exit_on_filter_vname",
    "them"
  ]),
  BHV_LegRun: new Set([
    "cycleflag",
    "full_leg",
    "leg_length",
    "leg_length_mod",
    "midflag",
    "midpct",
    "shift_point",
    "warn_overshoot",
    "wpt_status_var",
    "wptflag"
  ]),
  BHV_OpRegionV24: new Set([
    "draw_save_statue",
    "polygon"
  ]),
  BHV_OpRegionRecover: new Set([
    "breached_poly_flag"
  ]),
  BHV_Shadow: new Set([
    "exit_on_filter_vname",
    "them"
  ]),
  BHV_Trail: new Set([
    "exit_on_filter_vname",
    "n_alert_request",
    "them"
  ]),
  BHV_ZigZag: new Set([
    "max_stem_dist"
  ])
};
const behaviorBaseKinds = {};

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

function sortedObject(input) {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
}

function addToSetMap(map, key, value) {
  if (!key || !value) return;
  if (!map[key]) map[key] = new Set();
  map[key].add(value);
}

function addParamToOwner(map, owner, param, replaceCase = false) {
  if (!owner || !param) return;
  if (behaviorParameterExclusions[owner]?.has(param)) return;
  if (!map[owner]) map[owner] = new Set();
  const lower = param.toLowerCase();
  for (const existing of map[owner]) {
    if (existing.toLowerCase() === lower) {
      if (replaceCase && existing !== param) {
        map[owner].delete(existing);
        map[owner].add(param);
      }
      return;
    }
  }
  map[owner].add(param);
}

function addParamsToOwner(map, owner, params) {
  params.forEach((param) => addParamToOwner(map, owner, param));
}

function normalizeKey(key) {
  return key.replace(/\[[^\]]+\]$/, "");
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function loadOptionalJson(relativePath) {
  const filePath = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeLookupKey(key) {
  return key.toLowerCase().replace(/-/g, "_");
}

function extractEmacsKeywordList(file) {
  if (!fs.existsSync(file)) return {};
  const text = readText(file);
  const entries = {};
  const entryRegex = /'\(\s*((?:"[^"]*"\s*)+)\)/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(text)) !== null) {
    const strings = [];
    const stringRegex = /"([^"]*)"/g;
    let stringMatch;
    while ((stringMatch = stringRegex.exec(entryMatch[1])) !== null) {
      if (stringMatch[1]) strings.push(stringMatch[1]);
    }
    if (strings.length) {
      const [name, ...params] = strings;
      entries[name] = new Set(params.filter(isValidParameterToken));
    }
  }
  return entries;
}

function isValidParameterToken(param) {
  return /^[A-Za-z_][A-Za-z0-9_+:-]*$/.test(param) && !param.endsWith("_");
}

function extractBlocks(text, blockRegex) {
  const blocks = [];
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const name = match[1];
    const openIndex = text.indexOf("{", blockRegex.lastIndex);
    if (openIndex === -1) continue;
    let depth = 0;
    let end = -1;
    for (let i = openIndex; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    if (end !== -1) {
      blocks.push({ name, body: text.slice(openIndex + 1, end) });
      blockRegex.lastIndex = end + 1;
    }
  }
  return blocks;
}

function extractAssignmentKeys(body) {
  const keys = new Set();
  for (const line of body.split(/\r?\n/)) {
    const clean = line.replace(/\/\/.*$/, "");
    const match = clean.match(/^\s*([A-Za-z_][A-Za-z0-9_+:-]*(?:\[[^\]]+\])?)\s*=/);
    if (match) keys.add(normalizeKey(match[1]));
  }
  return keys;
}

function extractInfoConfigParams(file) {
  const text = readText(file);
  const params = new Set();
  const lineRegex = /\b(?:blk|blu|mag|cyn|grn)\("([^"]*)"/g;
  let inConfigBlock = false;
  let match;
  while ((match = lineRegex.exec(text)) !== null) {
    const line = match[1];
    if (/ProcessConfig\s*=/.test(line)) {
      inConfigBlock = true;
      continue;
    }
    if (inConfigBlock && /^\s*}\s*$/.test(line)) {
      inConfigBlock = false;
      continue;
    }
    if (!inConfigBlock) continue;
    const keyMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_+:-]*)\s*=/);
    if (keyMatch && isValidParameterToken(keyMatch[1])) params.add(keyMatch[1]);
  }
  return params;
}

function extractSetParamParams(file) {
  const text = readText(file);
  const params = new Set();
  const name = path.basename(file, ".cpp");
  const body = extractClassMethodBody(text, name, "setParam");
  if (!body) return params;

  const regexes = [
    /\b(?:param|param_low|g_param)\s*==\s*"([^"]+)"/g,
    /"([^"]+)"\s*==\s*\b(?:param|param_low|g_param)\b/g,
    /\b(?:IvPBehavior|IvPContactBehavior|this)\s*(?:::|->)\s*setParam\s*\(\s*"([^"]+)"/g
  ];
  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(body)) !== null) {
      const param = match[1];
      if (isValidParameterToken(param)) params.add(param);
    }
  }
  return params;
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function extractClassMethodBody(text, className, methodName) {
  const regex = new RegExp(`\\b(?:bool|void|string|IvPFunction\\s*\\*)\\s+${className}::${methodName}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const match = regex.exec(text);
  if (!match) return "";
  const openIndex = text.indexOf("{", match.index);
  const closeIndex = findMatchingBrace(text, openIndex);
  return closeIndex === -1 ? "" : text.slice(openIndex + 1, closeIndex);
}

function behaviorBaseKind(cppFile) {
  const dir = path.dirname(cppFile);
  const name = path.basename(cppFile, ".cpp");
  const header = path.join(dir, `${name}.h`);
  if (!fs.existsSync(header)) return "";
  const text = readText(header);
  const match = text.match(new RegExp(`class\\s+${name}\\s*:\\s*public\\s+([A-Za-z0-9_]+)`));
  return match ? match[1] : "";
}

function isConfigurableBehaviorFile(file) {
  const base = behaviorBaseKind(file);
  return base === "IvPBehavior" || base === "IvPContactBehavior";
}

const moosDocs = loadOptionalJson("data/moos-docs.json");
const bhvDocs = loadOptionalJson("data/bhv-docs.json");
const moosLanguage = loadOptionalJson("data/moos-language.json");
const bhvLanguage = loadOptionalJson("data/bhv-language.json");
const moosSource = loadOptionalJson("data/moos-source.json");
const bhvSource = loadOptionalJson("data/bhv-source.json");
const diagnosticSchema = loadOptionalJson("data/diagnostic-schema.json");

function schemaParameterEntry(container, param) {
  if (!container) return undefined;
  const parameters = container.parameters || container;
  return parameters[param]
    || parameters[normalizeLookupKey(param)]
    || parameters[param.toLowerCase()];
}

function diagnosticSchemaEntry(owner, param, kind) {
  if (!diagnosticSchema) return undefined;
  if (kind === "moos") {
    return schemaParameterEntry(diagnosticSchema.apps?.[owner], param)
      || schemaParameterEntry(diagnosticSchema.shared?.moosApp, param);
  }

  const ownerSchema = diagnosticSchema.behaviors?.[owner];
  const ownerEntry = schemaParameterEntry(ownerSchema, param);
  if (ownerEntry) return ownerEntry;

  for (const sharedName of ownerSchema?.inherits || []) {
    const inheritedEntry = schemaParameterEntry(diagnosticSchema.shared?.[sharedName], param);
    if (inheritedEntry) return inheritedEntry;
  }

  return undefined;
}

function numericCandidate(constraints = {}) {
  if (constraints.minimum !== undefined) {
    return String(Number(constraints.minimum) + (constraints.minimumExclusive ? 1 : 0));
  }
  if (constraints.maximum !== undefined) {
    return String(Number(constraints.maximum) - (constraints.maximumExclusive ? 1 : 0));
  }
  return constraints.integer ? "10" : "10";
}

function defaultSatisfiesEnum(entry) {
  if (entry.default === undefined || entry.default === "") return false;
  const defaultValue = String(entry.default);
  const allowed = entry.constraints?.enum || [];
  if (entry.constraints?.caseInsensitive) {
    return allowed.map((value) => value.toLowerCase()).includes(defaultValue.toLowerCase());
  }
  return allowed.includes(defaultValue);
}

function sampleFromDiagnosticSchema(entry) {
  if (!entry || entry.diagnostic !== true) return undefined;

  if (entry.valueType === "enum" || entry.valueType === "boolean-token") {
    return defaultSatisfiesEnum(entry)
      ? String(entry.default)
      : String((entry.constraints?.enum || ["true"])[0]);
  }

  if (entry.valueType === "number") {
    return numericCandidate(entry.constraints || {});
  }

  if (entry.valueType === "number-or-enum") {
    const numberConstraints = entry.constraints?.number || {};
    return numericCandidate(numberConstraints);
  }

  if (entry.valueType === "number-or-delta" || entry.valueType === "number-or-adjustment") {
    return "10";
  }

  if (entry.valueType === "number-range") {
    const value = numericCandidate(entry.constraints || {});
    return `${value}:${value}`;
  }

  if (entry.valueType === "number-pair-ascending") {
    return "0,10";
  }

  if (entry.valueType === "number-pair") {
    return "1,1";
  }

  if (entry.valueType === "ip-address") {
    return "localhost";
  }

  if (entry.valueType === "tif-file") {
    return "background.tif";
  }

  if (entry.valueType === "single-equals-pair") {
    return "key=value";
  }

  if (entry.valueType === "comma-list-no-whitespace") {
    return "alpha,beta";
  }

  if (entry.valueType === "no-whitespace-string"
    || entry.valueType === "non-empty-string"
    || entry.valueType === "non-empty-no-whitespace-string") {
    return "example";
  }

  return undefined;
}

function paramDescription(owner, param, kind) {
  const key = normalizeLookupKey(param);
  const docs = kind === "moos" ? moosDocs : bhvDocs;
  const language = kind === "moos" ? moosLanguage : bhvLanguage;
  const source = kind === "moos" ? moosSource : bhvSource;
  return docs.items?.[owner]?.parameters?.[key]?.description
    || source.items?.[owner]?.parameters?.[key]?.description
    || language.parameters?.[param]
    || language.parameters?.[key]
    || "";
}

function isBooleanDescription(description) {
  return /\bboolean\b/i.test(description)
    || /\b(?:if|when)\s+(?:set\s+to\s+)?(?:true|false)\b/i.test(description)
    || /\bdefault\s+is\s+(?:true|false)\b/i.test(description)
    || /\b(?:true|false)\s+or\s+(?:true|false)\b/i.test(description)
    || /\bor\s+\{?true\}?\b/i.test(description)
    || /\bor\s+\{?false\}?\b/i.test(description);
}

function sampleValue(owner, param, kind) {
  const lower = param.toLowerCase();
  const schemaSample = sampleFromDiagnosticSchema(diagnosticSchemaEntry(owner, param, kind));
  if (schemaSample !== undefined) return schemaSample;

  const description = paramDescription(owner, param, kind);
  if (["apptick", "commstick"].includes(lower)) return "4";
  if (lower === "gentlekill") return "true";
  if (lower === "msbetweenlaunches") return "100";
  if (lower === "newconsole") return "false";
  if (lower === "max_appcast_events") return "8";
  if (lower === "app_logging") return "true";
  if (lower.startsWith("flip:")) return "source_variable = MVIEWER_LCLICK";
  if (lower === "action+") return "DEPLOY=true";
  if (lower === "ipf-type" || lower === "ipf_type") return "zaic";
  if (lower === "fix_turn") return "180";
  if (lower === "mod_hdg") return "20";
  if (lower === "turn_dir") return "port";
  if (lower === "turn_spec") return "spd=1.0, turn=180, dir=port";
  if (lower.endsWith("_dir") && lower.includes("turn")) return "port";
  if (lower.includes("condition")) return "DEPLOY = true";
  if (lower === "flag" || lower.includes("flag")) return "EXAMPLE_FLAG = true";
  if (kind === "bhv" && lower === "name") return owner.replace(/^BHV_/, "").toLowerCase();
  if (lower === "pwt" || lower === "priority") return "100";
  if (lower === "updates") return `${owner.toUpperCase()}_UPDATES`;
  if (lower === "visual_hints") return "vertex_size=3, edge_color=gray";
  if (lower === "perpetual" || lower === "templating") return "false";
  if (lower === "build_info" || lower === "deprecated" || lower.includes("deprecated") || lower.includes("debug")) return "false";
  if (lower === "watch") return "pHelmIvP";
  if (lower.startsWith("draw_") && lower.includes("poly")) return "true";
  if (lower.endsWith("_breach")) return "true";
  if (lower === "show_pt" || lower === "view_pt" || lower === "show_source_pts") return "true";
  if (lower === "headon_only" || lower.endsWith("_ok") || lower.endsWith("_only")) return "true";
  if (lower === "rng_safety") return "true";
  if (lower === "use_refinery") return "true";
  if (lower === "post_mapping") return "source=EXAMPLE_STATUS,dest=EXAMPLE_STATUS_ALT";
  if (lower === "post_per_contact_info") return "true";
  if (lower === "descriptor" || lower === "label" || lower.endsWith("_label")) return "example_label";
  if (lower === "id" || lower.endsWith("_id")) return "example_id";
  if (lower === "contact" || lower === "them" || lower.endsWith("_contact")) return "abe";
  if (lower === "vname" || lower.endsWith("_vname") || lower === "target_name") return "abe";
  if (isBooleanDescription(description)) return "true";
  if (lower.startsWith("warn") || lower.startsWith("no_") || lower.startsWith("can_") || lower.includes("validity")) return "true";
  if (lower.includes("addr") || lower.includes("hostip")) return "localhost";
  if (lower === "port" || lower.endsWith("_port")) return "9000";
  if (lower.includes("region")) return "0,0 : 50,0 : 50,-50 : 0,-50";
  if (lower.includes("config")) return "label=example";
  if (lower.includes("extrapolate") || lower.includes("plateau") || lower.includes("uniform_")) return "true";
  if (lower.includes("var")) return "EXAMPLE_VAR";
  if (lower.includes("prefix")) return "NAV";
  if (lower.includes("group")) return "alpha";
  if (lower.includes("type")) return "kayak";
  if (lower.includes("name")) return "example_name";
  if (lower.includes("position")) return "present_position";
  if (lower.endsWith("_degs")) return "30";
  if (lower.includes("delta")) return "1";
  if (lower === "newpt") return "0,0";
  if (lower === "wpt_status") return "WPT_STAT";
  if (lower.includes("mode")) return "normal";
  if (lower.includes("policy")) return "normal";
  if (lower.includes("voice")) return "default";
  if (lower.includes("file")) return kind === "moos" ? "results.txt" : "example.txt";
  if (lower.includes("path") || lower.endsWith("_dir") || lower.includes("directory")) return "./";
  if (lower.includes("color")) return "yellow";
  if (lower.includes("point")) return "0,0";
  if (lower.endsWith("_pt") || lower === "pt") return "0,0";
  if (lower === "x" || lower === "y" || /(?:^|_)(?:x|y)$/.test(lower) || /^(?:os|pt|cn)[xy]$/.test(lower)) return "0";
  if (lower === "lat" || lower.endsWith("_lat") || /^(?:os|cn)lat$/.test(lower)) return "42.358";
  if (lower === "lon" || lower.endsWith("_lon") || /^(?:os|cn)lon$/.test(lower)) return "-71.087";
  if (lower.includes("polygon") || lower === "poly") return "0,0 : 50,0 : 50,-50 : 0,-50";
  if (lower.includes("poly")) return "0,0 : 50,0 : 50,-50 : 0,-50";
  if (lower.includes("speed") || lower.includes("spd")) return "1.2";
  if (lower === "osv") return "1.2";
  if (lower.includes("heading") || lower.includes("course") || lower.includes("crs") || lower.includes("hdg") || lower.endsWith("osh")) return "90";
  if (lower.includes("depth") || lower.includes("altitude")) return "5";
  if (lower.includes("pid_kp")) return "1.0";
  if (lower.includes("pid_kd") || lower.includes("pid_ki")) return "0.0";
  if (lower.includes("pid_integral")) return "0.0";
  if (lower.includes("pitch")) return "30";
  if (lower.includes("rudder") || lower.includes("thrust") || lower.includes("elevator")) return "100";
  if (lower.includes("pwt")) return "100";
  if (lower.includes("radius") || lower.includes("range") || lower.includes("dist") || lower.endsWith("_rad") || lower.includes("_rad_")) return "10";
  if (lower.includes("time") || lower.includes("duration") || lower.includes("interval") || lower.includes("delay") || lower.includes("rate") || lower.includes("age") || lower.includes("decay")) return "5";
  if (lower.includes("pts_per") || lower.includes("history") || lower.includes("index") || lower.endsWith("ix")) return "1";
  if (lower.includes("tick") || lower.includes("count") || lower.includes("size") || lower.includes("width") || lower.includes("length")) return "4";
  if (lower.includes("thresh") || lower.includes("tolerance") || lower === "tol") return "10";
  if (lower.includes("ratio") || lower.includes("pct") || lower.includes("percent") || lower.includes("transparency")) return "0.5";
  if (lower.includes("weight") || lower.includes("factor") || lower.includes("strength") || lower.includes("patience")) return "1.0";
  if (lower.includes("lead") || lower.includes("bias") || lower.includes("gap")) return "10";
  if (lower.includes("repeat") || lower.startsWith("allow") || lower.startsWith("enable") || lower.startsWith("disable") || lower.startsWith("ignore") || lower.startsWith("reject")) return "true";
  if (lower.includes("verbose")) return "true";
  if (lower.includes("viewable") || lower.includes("enable") || lower.includes("active") || lower.includes("control")) return "true";
  if (lower === "input") return "route = localhost:9200";
  if (lower === "domain") return "course:0:359:360";
  if (lower === "behaviors") return "meta_vehicle.bhv";
  if (lower === "event") return "var=EXAMPLE, val=true, time=1";
  if (lower === "run") return "pHelmIvP @ NewConsole = false";
  return kind === "bhv" ? "example" : "example";
}

const appParams = {};
const appSources = {};
const appSourceKinds = {};
const behaviorParams = {};
const behaviorSources = {};
const behaviorSourceKinds = {};

function addSourceKind(map, owner, kind) {
  if (!owner || !kind) return;
  if (!map[owner]) map[owner] = new Set();
  map[owner].add(kind);
}

function primarySourceStatus(kinds) {
  if (kinds.includes("local-ivp-source")) return "local-ivp-source";
  if (kinds.includes("local-moos-source")) return "local-moos-source";
  if (kinds.includes("editor-mode-inventory")) return "editor-mode-inventory";
  return "unknown";
}

const emacsApps = extractEmacsKeywordList(path.join(MOOS_ROOT, "editor-modes", "moos-apps.el"));
const emacsBehaviors = extractEmacsKeywordList(path.join(MOOS_ROOT, "editor-modes", "moos-bhvs.el"));

const allowedApps = new Set(Object.keys(appParams));
const allowedBehaviors = new Set(Object.keys(behaviorParams));

if (fs.existsSync(SRC_ROOT)) {
  for (const entry of fs.readdirSync(SRC_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("dep_")) continue;
    const name = entry.name;
    if (inactiveAppFamilyMembers.has(name)) continue;
    if (/^[pui][A-Z]/.test(name)) {
      allowedApps.add(name);
      if (!appParams[name]) appParams[name] = new Set();
      addSourceKind(appSourceKinds, name, "local-ivp-source");
      addToSetMap(appSources, name, path.relative(REPO_ROOT, path.join(SRC_ROOT, entry.name)));
    }
  }
  allowedApps.add("MOOSDB");
  allowedApps.add("ANTLER");

  const behaviorFiles = walk(SRC_ROOT, (file) => /BHV_[A-Za-z0-9_]+\.cpp$/.test(file));
  for (const file of behaviorFiles) {
    if (file.includes(`${path.sep}lib_dep_behaviors${path.sep}`)) continue;
    if (!isConfigurableBehaviorFile(file)) continue;
    const name = path.basename(file, ".cpp");
    if (inactiveBehaviorFamilyMembers.has(name)) continue;
    allowedBehaviors.add(name);
    behaviorBaseKinds[name] = behaviorBaseKind(file);
    if (!behaviorParams[name]) behaviorParams[name] = new Set();
    addSourceKind(behaviorSourceKinds, name, "local-ivp-source");
  }
}

const coreMoosApps = {
  ANTLER: path.join(MOOS_ROOT, "MOOS_Jul2724", "MOOSEssentials", "Essentials", "pAntler"),
  pLogger: path.join(MOOS_ROOT, "MOOS_Jul2724", "MOOSEssentials", "Essentials", "pLogger"),
  pShare: path.join(MOOS_ROOT, "MOOS_Jul2724", "MOOSEssentials", "Essentials", "pShare")
};
for (const [app, dir] of Object.entries(coreMoosApps)) {
  if (!fs.existsSync(dir)) continue;
  allowedApps.add(app);
  if (!appParams[app]) appParams[app] = new Set();
  addSourceKind(appSourceKinds, app, "local-moos-source");
  addToSetMap(appSources, app, path.relative(REPO_ROOT, dir));
}
["ExecutablePath", "GentleKill"].forEach((param) => {
  addParamToOwner(appParams, "ANTLER", param);
});

for (const [app, params] of Object.entries(emacsApps)) {
  if (!allowedApps.has(app)) continue;
  if (!appParams[app]) appParams[app] = new Set();
  addParamsToOwner(appParams, app, params);
  addToSetMap(appSources, app, path.relative(REPO_ROOT, path.join(MOOS_ROOT, "editor-modes", "moos-apps.el")));
}

for (const [behavior, params] of Object.entries(emacsBehaviors)) {
  if (!allowedBehaviors.has(behavior)) continue;
  if (!behaviorParams[behavior]) behaviorParams[behavior] = new Set();
  addParamsToOwner(behaviorParams, behavior, params);
  addToSetMap(behaviorSources, behavior, path.relative(REPO_ROOT, path.join(MOOS_ROOT, "editor-modes", "moos-bhvs.el")));
}

if (fs.existsSync(SRC_ROOT)) {
  for (const entry of fs.readdirSync(SRC_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("dep_")) continue;
    const dir = path.join(SRC_ROOT, entry.name);
    const infoFiles = walk(dir, (file) => /_Info\.cpp$/.test(file));
    for (const info of infoFiles) {
      const params = extractInfoConfigParams(info);
      const appName = entry.name;
      if (inactiveAppFamilyMembers.has(appName)) continue;
      if (!allowedApps.has(appName)) continue;
      for (const param of params) addParamToOwner(appParams, appName, param, true);
      if (params.size) addToSetMap(appSources, appName, path.relative(REPO_ROOT, info));
      if (params.size) addSourceKind(appSourceKinds, appName, "local-ivp-source");
    }
  }

  const behaviorFiles = walk(SRC_ROOT, (file) => /BHV_[A-Za-z0-9_]+\.cpp$/.test(file));
  for (const file of behaviorFiles) {
    if (file.includes(`${path.sep}lib_dep_behaviors${path.sep}`)) continue;
    if (!isConfigurableBehaviorFile(file)) continue;
    const name = path.basename(file, ".cpp");
    if (inactiveBehaviorFamilyMembers.has(name)) continue;
    if (!allowedBehaviors.has(name)) continue;
    const params = extractSetParamParams(file);
    for (const param of params) addParamToOwner(behaviorParams, name, param);
    addToSetMap(behaviorSources, name, path.relative(REPO_ROOT, file));
    addSourceKind(behaviorSourceKinds, name, "local-ivp-source");
  }
}

["AppTick", "CommsTick"].forEach((param) => {
  for (const app of Object.keys(appParams)) addParamToOwner(appParams, app, param);
});

const inheritedBehaviorParams = [
  "name", "descriptor", "us", "pwt", "priwt", "priority", "condition",
  "comms_policy", "duration_status", "duration_reset", "duration_idle_decay",
  "post_mapping", "spawnflag", "spawn_flag", "runxflag", "runx_flag",
  "spawnxflag", "spawnx_flag", "runflag", "run_flag", "activeflag",
  "active_flag", "inactiveflag", "inactive_flag", "idleflag", "idle_flag",
  "endflag", "end_flag", "configflag", "config_flag", "no_starve",
  "nostarve", "duration", "perpetual", "build_info", "updates",
  "precision", "templating", "max_spawnings"
];
const contactBehaviorParams = [
  "contact", "extrapolate", "post_per_contact_info", "match_name",
  "ignore_name", "match_group", "ignore_group", "match_type", "ignore_type",
  "match_region", "ignore_region", "strict_ignore", "exit_on_filter_vtype",
  "exit_on_filter_group", "exit_on_filter_region", "cnflag", "decay",
  "on_no_contact_ok", "decay_end", "time_on_leg",
  "bearing_line_label_show", "bearing_line_show", "bearing_line_config",
  "bearing_lines"
];
const delegatedBehaviorParams = {
  BHV_LegRun: [
    "p1", "p2", "vx1", "vx2", "leg", "leg_len", "leg_len_mod",
    "leg_ang", "leg_ang_mod", "shift_pt", "turn1_bias",
    "turn2_bias", "turn_bias", "turn1_bias_mod", "turn2_bias_mod",
    "turn_bias_mod", "turn1_ext", "turn2_ext", "turn_ext",
    "turn1_ext_mod", "turn2_ext_mod", "turn_ext_mod", "turn1_rad",
    "turn2_rad", "turn_rad", "turn_rad_min", "turn1_rad_mod",
    "turn2_rad_mod", "turn_rad_mod", "turn_pt_gap", "turn1_dir",
    "turn2_dir", "turn_dir", "id"
  ]
};
const behaviorExampleOmitParams = new Set([
  "active_flag", "build_info", "comms_policy", "config_flag", "configflag",
  "descriptor", "duration_idle_decay", "duration_reset", "duration_status",
  "end_flag", "idle_flag", "inactive_flag", "max_spawnings", "no_starve",
  "nostarve", "precision", "priwt", "run_flag", "runx_flag", "runxflag",
  "spawn_flag", "spawnflag", "spawnxflag", "us"
]);
for (const behavior of Object.keys(behaviorParams)) {
  inheritedBehaviorParams.forEach((param) => addParamToOwner(behaviorParams, behavior, param));
  if (behaviorBaseKinds[behavior] === "IvPContactBehavior") {
    contactBehaviorParams.forEach((param) => addParamToOwner(behaviorParams, behavior, param));
  }
  (delegatedBehaviorParams[behavior] || []).forEach((param) => addParamToOwner(behaviorParams, behavior, param));
}

function buildInventory(paramMap, sourceMap, sourceKindMap) {
  const items = {};
  const parameterIndex = {};
  for (const name of Object.keys(paramMap).sort()) {
    const params = Array.from(paramMap[name]).sort();
    const sourceKinds = Array.from(sourceKindMap[name] || []).sort();
    items[name] = {
      parameters: params,
      sources: Array.from(sourceMap[name] || []).slice(0, 12).sort(),
      sourceKinds,
      sourceStatus: primarySourceStatus(sourceKinds)
    };
    for (const param of params) addToSetMap(parameterIndex, param, name);
  }
  return {
    generatedFrom: {
      moosIvP: MOOS_ROOT
    },
    items,
    parameters: sortedObject(Object.fromEntries(
      Object.entries(parameterIndex).map(([key, values]) => [key, Array.from(values).sort()])
    ))
  };
}

const moosInventory = buildInventory(appParams, appSources, appSourceKinds);
const bhvInventory = buildInventory(behaviorParams, behaviorSources, behaviorSourceKinds);

fs.mkdirSync(path.join(REPO_ROOT, "data"), { recursive: true });
fs.mkdirSync(path.join(REPO_ROOT, "examples"), { recursive: true });
fs.writeFileSync(path.join(REPO_ROOT, "data", "moos-inventory.json"), `${JSON.stringify(moosInventory, null, 2)}\n`);
fs.writeFileSync(path.join(REPO_ROOT, "data", "bhv-inventory.json"), `${JSON.stringify(bhvInventory, null, 2)}\n`);

const moosLines = [
  "//-------------------------------------------------",
  "// FILE: all_apps.moos",
  "// NAME: MOOS-IvP Editor",
  "// NOTE: Generated inventory fixture; not a runnable mission.",
  "//-------------------------------------------------",
  "",
  "ServerHost   = localhost",
  "ServerPort   = 9000",
  "Community    = inventory",
  "MOOSTimeWarp = 1",
  ""
];

for (const [app, data] of Object.entries(moosInventory.items)) {
  if (!data.parameters.length) continue;
  moosLines.push("//----------------------------------------------------");
  if (data.sourceStatus === "editor-mode-inventory") {
    moosLines.push("// SOURCE: editor-mode inventory only; no matching local source found");
  } else if (data.sourceStatus === "local-moos-source") {
    moosLines.push("// SOURCE: local bundled MOOS source, not ivp/src");
  }
  moosLines.push(`ProcessConfig = ${app}`);
  moosLines.push("{");
  for (const param of data.parameters) {
    moosLines.push(`  ${param.padEnd(28)} = ${sampleValue(app, param, "moos")}`);
  }
  moosLines.push("}");
  moosLines.push("");
}

fs.writeFileSync(path.join(REPO_ROOT, "examples", "all_apps.moos"), `${moosLines.join("\n")}\n`);

const bhvLines = [
  "//-------------------------------------------------",
  "// FILE: all_behaviors.bhv",
  "// NAME: MOOS-IvP Editor",
  "// NOTE: Generated inventory fixture; not a runnable behavior file.",
  "//-------------------------------------------------",
  "",
  "initialize DEPLOY = false",
  "",
  "set MODE = ACTIVE {",
  "  DEPLOY = true",
  "} INACTIVE",
  ""
];

for (const [behavior, data] of Object.entries(bhvInventory.items)) {
  if (!data.parameters.length) continue;
  bhvLines.push("//----------------------------------------------------");
  if (data.sourceStatus === "editor-mode-inventory") {
    bhvLines.push("// SOURCE: editor-mode inventory only; no matching local behavior source found");
  }
  bhvLines.push(`Behavior = ${behavior}`);
  bhvLines.push("{");
  for (const param of data.parameters.filter((param) => !behaviorExampleOmitParams.has(param))) {
    bhvLines.push(`  ${param.padEnd(28)} = ${sampleValue(behavior, param, "bhv")}`);
  }
  bhvLines.push("}");
  bhvLines.push("");
}

fs.writeFileSync(path.join(REPO_ROOT, "examples", "all_behaviors.bhv"), `${bhvLines.join("\n")}\n`);

console.log(`apps=${Object.keys(moosInventory.items).length}`);
console.log(`appParameters=${Object.keys(moosInventory.parameters).length}`);
console.log(`behaviors=${Object.keys(bhvInventory.items).length}`);
console.log(`behaviorParameters=${Object.keys(bhvInventory.parameters).length}`);
