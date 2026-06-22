const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MOOS_ROOT = process.env.MOOS_IVP_ROOT || "/Users/charlesbenjamin/moos-ivp";
const SRC_ROOT = path.join(MOOS_ROOT, "ivp", "src");

const inactiveBehaviorFamilyMembers = new Set([
  "BHV_AvdColregsV17",
  "BHV_AvdColregsV19",
  "BHV_OpRegion"
]);

const inheritedBehaviorParams = new Set([
  "name", "descriptor", "us", "pwt", "priwt", "priority", "condition",
  "comms_policy", "duration_status", "duration_reset", "duration_idle_decay",
  "post_mapping", "spawnflag", "spawn_flag", "runxflag", "runx_flag",
  "spawnxflag", "spawnx_flag", "runflag", "run_flag", "activeflag",
  "active_flag", "inactiveflag", "inactive_flag", "idleflag", "idle_flag",
  "endflag", "end_flag", "configflag", "config_flag", "no_starve",
  "nostarve", "duration", "perpetual", "build_info", "updates",
  "precision", "templating", "max_spawnings"
]);
const contactBehaviorParams = new Set([
  "contact", "extrapolate", "post_per_contact_info", "match_name",
  "ignore_name", "match_group", "ignore_group", "match_type", "ignore_type",
  "match_region", "ignore_region", "strict_ignore", "exit_on_filter_vtype",
  "exit_on_filter_group", "exit_on_filter_region", "cnflag", "decay",
  "on_no_contact_ok", "decay_end", "time_on_leg",
  "bearing_line_label_show", "bearing_line_show", "bearing_line_config",
  "bearing_lines"
]);
const delegatedBehaviorParams = {
  BHV_LegRun: new Set([
    "p1", "p2", "vx1", "vx2", "leg", "leg_len", "leg_len_mod",
    "leg_ang", "leg_ang_mod", "shift_pt", "turn1_bias",
    "turn2_bias", "turn_bias", "turn1_bias_mod", "turn2_bias_mod",
    "turn_bias_mod", "turn1_ext", "turn2_ext", "turn_ext",
    "turn1_ext_mod", "turn2_ext_mod", "turn_ext_mod", "turn1_rad",
    "turn2_rad", "turn_rad", "turn_rad_min", "turn1_rad_mod",
    "turn2_rad_mod", "turn_rad_mod", "turn_pt_gap", "turn1_dir",
    "turn2_dir", "turn_dir", "id"
  ])
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
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

function normalizeName(name) {
  return name.toLowerCase().replace(/-/g, "_");
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

function extractSetParamBody(text, behavior) {
  const regex = new RegExp(`(?:bool|IvPFunction\\s*\\*)\\s+${behavior}::setParam\\s*\\([^)]*\\)\\s*\\{`, "m");
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
  const text = fs.readFileSync(header, "utf8");
  const match = text.match(new RegExp(`class\\s+${name}\\s*:\\s*public\\s+([A-Za-z0-9_]+)`));
  return match ? match[1] : "";
}

function isConfigurableBehaviorFile(file) {
  const base = behaviorBaseKind(file);
  return base === "IvPBehavior" || base === "IvPContactBehavior";
}

function collectParamComparisons(body) {
  const params = new Set();
  const patterns = [
    /\b(?:param|param_low|g_param)\s*==\s*"([^"]+)"/g,
    /"([^"]+)"\s*==\s*\b(?:param|param_low|g_param)\b/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      params.add(match[1]);
    }
  }

  return params;
}

function collectForwardedConfigParams(body) {
  const params = new Set();
  const pattern = /\b(?:IvPBehavior|IvPContactBehavior|IvPTemplater|this)\s*(?:::|->)\s*setParam\s*\(\s*"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    params.add(match[1]);
  }
  return params;
}

function collectHelperSetParamsOutsideBody(text, body, behavior) {
  const params = new Set();
  const scrubbed = body ? text.replace(body, "") : text;
  const pattern = /(?:\b[a-z][A-Za-z0-9_]*|\))[.]\s*setParam\s*\(\s*"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(scrubbed)) !== null) {
    params.add(match[1]);
  }
  return params;
}

function sourceBehaviorFiles() {
  const files = walk(SRC_ROOT, (file) => /BHV_[A-Za-z0-9_]+\.cpp$/.test(file));
  return files.filter((file) => {
    if (file.includes(`${path.sep}lib_dep_behaviors${path.sep}`)) return false;
    if (!isConfigurableBehaviorFile(file)) return false;
    const name = path.basename(file, ".cpp");
    return !inactiveBehaviorFamilyMembers.has(name);
  });
}

function main() {
  const inventory = readJson("data/bhv-inventory.json");
  const docs = readJson("data/bhv-docs.json");
  const source = readJson("data/bhv-source.json");
  const byBehavior = {};

  for (const file of sourceBehaviorFiles()) {
    const behavior = path.basename(file, ".cpp");
    const text = fs.readFileSync(file, "utf8");
    const body = extractSetParamBody(text, behavior);
    byBehavior[behavior] = {
      file,
      bodyFound: Boolean(body),
      sourceConfigParams: new Set([
        ...collectParamComparisons(body),
        ...collectForwardedConfigParams(body)
      ]),
      baseKind: behaviorBaseKind(file),
      helperParamsOutsideConfig: collectHelperSetParamsOutsideBody(text, body, behavior)
    };
  }

  const suspicious = [];
  const helperOnly = [];
  const noConfigBody = [];

  for (const [behavior, data] of Object.entries(inventory.items)) {
    const sourceData = byBehavior[behavior];
    if (!sourceData) continue;
    if (!sourceData.bodyFound) noConfigBody.push(behavior);

    const docParams = new Set(Object.keys(docs.items?.[behavior]?.parameters || {}));
    const sourceParams = new Set(Object.keys(source.items?.[behavior]?.parameters || {}));
    for (const param of data.parameters) {
      const key = normalizeName(param);
      const acceptedBySource = sourceData.sourceConfigParams.has(param)
        || sourceData.sourceConfigParams.has(key);
      const documented = docParams.has(key);
      const inherited = inheritedBehaviorParams.has(param)
        || inheritedBehaviorParams.has(key)
        || (sourceData.baseKind === "IvPContactBehavior"
          && (contactBehaviorParams.has(param) || contactBehaviorParams.has(key)));
      const delegated = delegatedBehaviorParams[behavior]?.has(param)
        || delegatedBehaviorParams[behavior]?.has(key);
      if (acceptedBySource || inherited || delegated) continue;

      const helperOnlyHit = sourceData.helperParamsOutsideConfig.has(param)
        || sourceData.helperParamsOutsideConfig.has(key)
        || sourceParams.has(key);
      const entry = {
        behavior,
        param,
        source: path.relative(REPO_ROOT, sourceData.file),
        reason: helperOnlyHit
          ? "not accepted/documented/inherited; appears in helper/runtime source inventory"
          : documented
            ? "documented in metadata but not accepted by source/inheritance/delegation"
            : "not accepted by source/inheritance/delegation"
      };
      suspicious.push(entry);
      if (helperOnlyHit) helperOnly.push(entry);
    }
  }

  console.log(`behaviors audited: ${Object.keys(byBehavior).length}`);
  console.log(`behaviors without setParam body: ${noConfigBody.length}`);
  if (noConfigBody.length) console.log(noConfigBody.join(", "));
  console.log(`suspicious inventory parameters: ${suspicious.length}`);
  console.log(`helper/runtime-looking suspicious parameters: ${helperOnly.length}`);

  for (const entry of suspicious) {
    console.log(`${entry.behavior} ${entry.param} :: ${entry.reason} :: ${entry.source}`);
  }

  if (suspicious.length) {
    process.exitCode = 1;
  }
}

main();
