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

function subjectFromParam(param) {
  return humanize(param)
    .replace(/\bvar\b/gi, "variable")
    .replace(/\bvars\b/gi, "variables")
    .replace(/\bspd\b/gi, "speed")
    .replace(/\bhdg\b/gi, "heading")
    .replace(/\bpt\b/gi, "point")
    .replace(/\bpoly\b/gi, "polygon")
    .replace(/\bop\b/gi, "operating")
    .replace(/\bcn\b/gi, "contact")
    .replace(/\bos\b/gi, "ownship")
    .replace(/\bpwt\b/gi, "priority weight")
    .replace(/\bnm\b/gi, "no-more")
    .replace(/\bix\b/gi, "index")
    .replace(/\butc\b/gi, "UTC")
    .replace(/\bcpa\b/gi, "CPA")
    .replace(/\bipf\b/gi, "IvP function")
    .replace(/\bzaic\b/gi, "ZAIC")
    .replace(/\bmoos\b/gi, "MOOS")
    .replace(/\bivp\b/gi, "IvP")
    .replace(/\s+/g, " ")
    .trim();
}

function objectLabel(param) {
  return subjectFromParam(param)
    .replace(/\bviewable all\b/i, "")
    .replace(/\bviewable labels\b/i, "labels")
    .replace(/\bvertex size\b/i, "vertex size")
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
  const phrase = subjectFromParam(param);
  const exact = {
    action: "Adds an Action-menu MOOS post available from pMarineViewer.",
    "action+": "Adds an additional Action-menu MOOS post available from pMarineViewer.",
    alert_verbose: "Enables verbose contact-alert reporting.",
    allow_park: "Allows the helm to enter PARK mode when parking commands are received.",
    app_logging: `Enables app-level logging for ${owner}.`,
    auto_bridg_mhash: "Automatically bridges mission-hash traffic through the shore broker.",
    bearing_lines: "Enables display of bearing-line visualization messages.",
    beat_flag: "Posts a configured heartbeat flag from pMarineViewer.",
    beacon: "Defines one beacon and its simulated range-report behavior.",
    behaviors_consise: "Uses the compact behavior-summary display in uHelmScope output.",
    bin_delta: "Sets the histogram bin width used for collision/obstacle detection metrics.",
    bin_min_val: "Sets the minimum value included in collision/obstacle detection histogram bins.",
    bhv_dir_not_found_ok: "Allows pHelmIvP startup to continue when a configured behavior directory is missing.",
    cmd: `Defines a command or MOOS post handled by ${owner}.`,
    contact_max_age: "Sets how old a contact report may be before pHelmIvP stops considering it current.",
    contacts_recap_interval: "Sets the interval between contact-recap postings.",
    collision_dist: "Sets the contact separation distance treated as a collision.",
    encounter_dist: "Sets the contact separation distance treated as an encounter.",
    encounter_rings: "Enables or configures range rings around encounter events.",
    compressalogs: "Compresses generated alog files after logging.",
    cross_fill_policy: "Controls whether pNodeReporter fills missing local or geodetic contact coordinates from the other coordinate form.",
    default_beacon_report_range: "Sets the default range at which beacon reports are generated.",
    default_hdg: "Sets the default spoofed node heading.",
    decay: "Sets how quickly stale contacts are retired by the contact manager.",
    default: `Sets the default configuration applied by ${owner} when a more specific setting is absent.`,
    display_pulses: "Toggles range-sensor pulse visualization.",
    display_radii_id: "Selects which configured alert/range radius is rendered.",
    doubleprecision: "Sets the number of digits written for double-valued alog entries.",
    drop_percentage: "Sets the percentage of node communication messages randomly dropped.",
    dual_state: "Enables the dual-state simulator output mode in uSimMarineV22.",
    extrap_policy: "Chooses how pMarineViewer extrapolates stale node reports for display.",
    extrap_hdg_thres: "Sets the heading-change threshold used when extrapolating node reports.",
    general_alert: "Defines the default obstacle-manager alert request.",
    given_obstacle: "Accepts or configures an obstacle polygon supplied to pObstacleMgr.",
    goals_mandatory: "Requires the helm to receive mandatory goal information before producing decisions.",
    grid_label: "Sets the label assigned to the search grid.",
    grid_opaqueness: "Sets rendered grid opacity.",
    ground_truth: "Selects the MOOS variable used as ground-truth contact state for range-sensor simulation.",
    halt_condition: "Stops uQueryDB when the named MOOS logic condition becomes true.",
    halt_max_time: "Stops uQueryDB after the configured maximum wait time.",
    helm_prefix: "Sets the prefix applied to selected pHelmIvP status variables.",
    hold_alerts_for_helm: "Holds contact alerts until the helm is ready to receive them.",
    hold_on_app: "Keeps the helm held until a named app is present.",
    hold_on_apps: "Keeps the helm held until all named apps are present.",
    history_length: "Sets how many historical path points uFldPathCheck retains.",
    input: "Defines an inbound pShare route.",
    ivp_behavior_dir: "Adds a directory for pHelmIvP to search for behavior libraries.",
    kcache: "Controls pHelmIvP behavior-set caching.",
    label: "Sets the label attached to a viewer object or display element.",
    log: "Adds a MOOS variable to pLogger's synchronous log list.",
    logauxsrc: "Includes MOOS auxiliary source information in pLogger async log entries.",
    loggingdirectorysummaryfile: "Names the file where pLogger writes a summary of log directories.",
    markdatatype: "Marks pLogger async log entries with each message's data type.",
    markexternalcommunitymessages: "Marks pLogger entries that originated from external MOOS communities.",
    marker_lcolor: "Sets the label color for map marker labels.",
    max_appcast_events: `Limits how many appcast events are retained in ${owner} reports.`,
    max_contacts: "Limits the number of contacts tracked by the contact manager.",
    max_duration: "Sets the maximum duration before the simulator or monitor entry expires.",
    max_retired_history: "Limits how much retired-contact history is retained.",
    max_rudder_degs_per_sec: "Limits how quickly the simulated rudder angle may change, in degrees per second.",
    max_time: "Sets the maximum time uQueryDB waits before halting.",
    max_trim_delay: "Sets how long uSimMarineV22 waits before applying a requested trim change.",
    mission_hash_display: "Controls whether the mission hash is shown in pMarineViewer.",
    mission_hash_var: "Names the MOOS variable containing the mission hash to display.",
    msg_max_history: "Limits the amount of message history retained by pRealm.",
    nav_grace: "Sets the grace period for accepting stale ownship navigation data.",
    nav_grace_periode: "Sets the grace period for accepting stale navigation data.",
    node_report_unc: "Configures the uncertainty rendering or interpretation for node reports.",
    node_skew: "Sets the allowed clock skew for incoming node reports.",
    nowatch: "Excludes a process or variable from a watch list.",
    ok_skew: "Sets the allowed clock-skew tolerance before pHelmIvP warns.",
    op_vertex: "Adds a vertex to the viewer operation-area polygon.",
    other_override_var: "Names the MOOS variable used to accept override commands from other communities.",
    output: "Defines an outbound pShare route.",
    park_on_allstop: "Parks the helm when an all-stop command is active.",
    paused: `Starts or keeps ${owner} paused when the app supports pausing.`,
    ping_wait: "Sets the minimum wait time between beacon range pings.",
    pmgen: "Configures the platform-model generator used by pHelmIvP.",
    polar_plot: "Defines the sailing polar plot used by the uSimMarineV22 wind model.",
    point_size: "Sets the size used when rendering simulated obstacle points.",
    poke: "Defines a MOOS variable-value post for uPokeDB.",
    prefer_interface: "Selects the preferred network interface for host reporting.",
    qblink: "Names the MOOS variable iBlinkStick subscribes to for blink/color commands.",
    randvar: "Defines a random variable used by uTimerScript event generation.",
    rate_frame: "Sets the frame rate used by uFldDelve.",
    reach_distance: "Sets the distance at which a vehicle is considered to have reached a beacon.",
    realmcast_channel: "Selects the realmcast channel displayed by the viewer.",
    realmcast_show_communinity: "Controls whether the realmcast community column is shown.",
    report_deltas: "Reports only changes in search-grid cell values.",
    report_vars: "Names the MOOS variables used for beacon range reports.",
    rn_algorithm: "Selects the random-noise algorithm applied to simulated sensor measurements.",
    rn_gaussian_sigma: "Sets the sigma value for Gaussian simulated range noise.",
    rn_uniform_pct: "Sets the percentage bound for uniform simulated range noise.",
    rows: "Sets the number of rows in the rendered grid or display table.",
    scope_set: "Defines the pRealm scope set to display or report.",
    sensor_arc: "Sets the angular field of view for simulated range sensing.",
    sensor_config: "Defines one generic simulated sensor and its report behavior.",
    source_point: "Adds a source point for generic sensor simulation.",
    start_engaged: "Starts pHelmIvP in the engaged state.",
    start_in_drive: "Starts pHelmIvP in drive rather than park.",
    synclog: "Controls synchronous logging in pLogger.",
    trim_tolerance: "Sets the tolerance for accepting a simulator trim request as achieved.",
    term_report_interval: "Sets how often pHelmIvP writes terminal status reports.",
    forward_variable: "Names the MOOS variable used to advance uTimerScript forwarding.",
    pause_variable: "Names the MOOS variable used to pause or resume uTimerScript.",
    truncated_output: "Truncates uHelmScope output to fit compact terminal displays.",
    turn_spd_map_full_rate: "Sets the turn-rate scale used at the full-speed point in the simulator turn-speed map.",
    turn_spd_map_full_speed: "Sets the speed corresponding to full turn-rate authority in the simulator turn-speed map.",
    turn_spd_map_null_rate: "Sets the turn-rate scale used at the null-speed point in the simulator turn-speed map.",
    turn_spd_map_null_speed: "Sets the speed corresponding to no turn-rate authority in the simulator turn-speed map.",
    utclogdirectories: "Uses UTC time when naming pLogger log directories.",
    verbose: `Enables verbose terminal or appcast reporting for ${owner}.`,
    vcolor: "Sets the color assigned to the named vehicle or viewer object.",
    volume: "Sets the default playback volume for iSay.",
    watch: `Adds a process or variable watch rule for ${owner}.`,
    watch_all: `Watches all processes or variables supported by ${owner}.`,
    watch_cluster: "Selects the appcast/realmcast cluster watched by the viewer.",
    watch_only: "Restricts uMemWatch reporting to the configured watched processes.",
    wildcardexclusionlog: "Logs wildcard-excluded variables separately.",
    wildcardomitpattern: "Adds a wildcard pattern for variables that pLogger should omit.",
    wind_conditions: "Defines the wind speed and direction used by the uSimMarineV22 wind model.",
    wormhole: "Defines a simulator wormhole region and its destination behavior."
  };
  if (exact[lower]) return exact[lower];

  if (lower.startsWith("flip:") || lower === "flip:1" || lower === "flip:2") {
    return "Defines a pEchoVar field-mapping rule from a source variable into a destination variable.";
  }
  if (/^button_(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)$/.test(lower)) {
    return "Defines a pMarineViewer command button and the MOOS post it triggers.";
  }
  if (/^(?:incoming|outgoing)_var$/i.test(param)) {
    return `${param} names one side of the pXRelay variable relay.`;
  }
  if (lower === "keyword") return "Defines a keyword substitution used in brokered node communications.";
  if (lower.startsWith("post_")) return `Enables posting of the ${subjectFromParam(param.replace(/^post_/, ""))} output.`;
  if (lower.endsWith("_var") || lower.endsWith("_vars") || lower.includes("var_name")) return `Names the MOOS ${phrase.replace(/\bvariable\b/i, "").trim()} variable.`;
  if (lower.endsWith("_flag") || lower.includes("flag")) return `Defines the MOOS variable-value flag posted for ${phrase.replace(/\bflag\b/i, "").trim()}.`;
  if (lower.includes("viewable_all")) return `Toggles rendering of all ${objectLabel(param)} objects.`;
  if (lower.includes("viewable_labels")) return `Toggles rendering of labels for ${objectLabel(param)} objects.`;
  if (lower.includes("show_title")) return `Toggles the ${phrase.replace(/^show title /, "")} field in the viewer title bar.`;
  if (lower.startsWith("show_")) return `Toggles display of ${phrase.replace(/^show /, "")}.`;
  if (lower.includes("color") || lower.includes("colour") || /^vcolor$/.test(lower)) return `Sets the display color for ${phrase.replace(/\bcolor\b/i, "").trim()}.`;
  if (lower.includes("shape")) return `Sets the rendered shape for ${phrase.replace(/\bshape\b/i, "").trim()}.`;
  if (lower.includes("transparency") || lower.includes("trans")) return `Sets the rendered transparency for ${phrase.replace(/\btransparency\b/i, "").trim()}.`;
  if (lower.includes("font_size")) return `Sets the font size for the ${phrase.replace(/\bfont size\b/i, "").trim()} pane.`;
  if (lower.includes("height")) return `Sets the display height for ${phrase.replace(/\bheight\b/i, "").trim()}.`;
  if (lower.includes("width")) return `Sets the display width for ${phrase.replace(/\bwidth\b/i, "").trim()}.`;
  if (lower.includes("size") || lower.includes("length")) return `Sets the ${phrase}.`;
  if (lower.includes("file") || lower.includes("path") || lower.includes("dir")) return `Names the file or directory for ${phrase}.`;
  if (lower.includes("range") || lower.includes("dist") || lower.includes("distance") || lower.includes("radius")) return `Sets the ${phrase} threshold or measurement distance.`;
  if (lower.includes("ignore") || lower.includes("reject")) return `Excludes contacts matching the configured ${phrase.replace(/^(ignore|reject) /, "")}.`;
  if (lower.includes("match")) return `Accepts only contacts matching the configured ${phrase.replace(/^match /, "")}.`;
  if (lower.includes("group") || lower.includes("type") || lower.includes("name") || lower === "vname") return `Sets the contact or object ${phrase}.`;
  if (lower.includes("stale")) return `Sets stale-data handling for ${phrase}.`;
  if (lower.includes("thresh") || lower.includes("threshold")) return `Sets the trigger threshold for ${phrase}.`;
  if (lower.includes("speed") || lower.includes("spd")) return `Sets the ${phrase}.`;
  if (lower.includes("heading") || lower.includes("hdg")) return `Sets the ${phrase}.`;
  if (lower.includes("depth")) return `Sets the ${phrase}.`;
  if (lower.includes("time") || lower.includes("interval") || lower.includes("duration") || lower.includes("delay")) return `Sets the ${phrase}.`;
  if (lower.includes("poly") || lower.includes("polygon") || lower.includes("region")) return `Defines the ${phrase}.`;
  if (
    lower === "x" || lower === "y" ||
    /(?:^|_)(?:x|y)$/.test(lower) ||
    /^(?:os|pt|cn)[xy]$/.test(lower) ||
    lower.includes("lat") ||
    lower.includes("lon")
  ) return `Sets the ${phrase} coordinate.`;
  return `Sets the ${phrase} option for ${owner}.`;
}

function behaviorDescription(owner, param) {
  const lower = normalizeName(param);
  const phrase = subjectFromParam(param);
  const exact = {
    activeflag: `Posts a MOOS variable-value flag when this ${owner} instance becomes active.`,
    action: "Selects the requested obstacle action, such as enabling or disabling a matching obstacle.",
    all_clear_distance: "Sets the contact range beyond which an avoidance maneuver is considered all clear.",
    allstop_on_breach: "Requests an all-stop action when an obstacle or operating-region breach is detected.",
    arrival_delta: "Sets the depth-arrival tolerance for BHV_GoToDepth.",
    arrival_flag: "Posts a flag when BHV_GoToDepth reaches its target depth.",
    atsurface_status_variable: "Names the MOOS variable that reports when the vehicle is at the surface.",
    avoid_mode: "Sets or reports the active COLREGS avoidance mode.",
    avoid_submode: "Sets or reports the active COLREGS avoidance sub-mode.",
    bearing_line_config: "Configures the bearing-line visualization published for the contact relationship.",
    bearing_line_label_show: "Controls whether bearing-line labels are shown in contact visualizations.",
    bearing_point: "Sets the point used to define the bearing line.",
    bias: "Sets the heading-bias offset applied to the behavior objective.",
    build_info: "Enables extra build/debug information in behavior output.",
    buffer_dist: "Sets the buffer distance around the operating region.",
    can_disable: "Allows the behavior to be disabled by contact-manager or obstacle-manager messages.",
    check_plateaus: "Enables plateau checks when validating generated IvP functions.",
    check_validity: "Enables validity checks on generated objective functions.",
    cnh: "Sets the contact heading supplied to contact-geometry calculations.",
    cncrs: "Sets the contact course used by contact-geometry calculations.",
    cnlat: "Sets the contact latitude used by contact-geometry calculations.",
    cnlon: "Sets the contact longitude used by contact-geometry calculations.",
    cnspd: "Sets the contact speed used by contact-geometry calculations.",
    cnv: "Sets the contact speed supplied to contact-geometry calculations.",
    cnx: "Sets the contact x-coordinate supplied to contact-geometry calculations.",
    cny: "Sets the contact y-coordinate supplied to contact-geometry calculations.",
    collision_depth: "Sets the depth separation threshold treated as a collision.",
    collision_distance: "Sets the contact or obstacle range treated as a collision.",
    condition: `MOOS logic condition that must hold for this ${owner} instance to run.`,
    contact: `Names the contact targeted by this ${owner} instance.`,
    cruise_speed: "Sets the nominal convoy cruise speed.",
    currix: "Sets the current waypoint index.",
    cycleflag: "Posts a flag each time the behavior completes a waypoint/leg cycle.",
    decay_end: "Sets the contact extrapolation age at which the behavior treats contact data as stale.",
    delay_complete: "Delays behavior completion after the stop condition is reached.",
    descriptor: `Sets the descriptor label used for this ${owner} instance in reports and visualizations.`,
    desired_speed: `Sets the desired transit speed for this ${owner} behavior.`,
    draw_path_loop: "Controls whether the waypoint path is drawn as a loop.",
    draw_req_hdg: "Toggles drawing of the requested zig-zag heading.",
    draw_save_statue: "Toggles drawing of the OpRegionV24 save-status visualization.",
    draw_set_hdg: "Toggles drawing of the set zig-zag heading.",
    dynamic_region_var: "Names the MOOS variable that supplies dynamic operating-region polygons.",
    duration: `Sets the duration limit for this ${owner} instance.`,
    edge_color: "Sets the edge color for the behavior's visualization.",
    edge_size: "Sets the edge line width for the behavior's visualization.",
    end_spd: "Sets the speed used near the end of a waypoint sequence.",
    eval_tol: "Sets the tolerance used when evaluating candidate COLREGS maneuvers.",
    exit_on_filter_vname: "Completes or exits the behavior when the contact name is filtered out.",
    extra_speed: "Sets the extra speed used when returning to a station or contact-relative position.",
    filter_var: "Names the MOOS variable providing values for the hysteresis filter.",
    fix: "Defines the fixed heading or heading source used by BHV_FixTurn.",
    fix_turn: "Defines the fixed-turn heading command.",
    full_leg: "Requires the vehicle to complete the full configured leg before transitioning.",
    full_avoid_mode: "Reports the combined COLREGS avoidance mode and sub-mode.",
    giveup_range: "Sets the contact range at which the behavior gives up pursuing the target geometry.",
    greedy_tour: "Allows waypoint ordering to be greedily optimized.",
    halt_dist: "Sets the distance from the operating-region boundary where halt behavior begins.",
    heading: `Sets the heading target for this ${owner} instance.`,
    heading_delta: "Sets the heading offset used for the heading-change maneuver.",
    headon_only: "Restricts COLREGS avoidance evaluation to head-on encounters.",
    hdg_basewidth: "Sets the heading objective-function base width.",
    hdg_peakwidth: "Sets the heading objective-function peak width.",
    holonomic_ok: "Suppresses warnings when obstacle avoidance is used with a holonomic platform model.",
    id: "Sets the obstacle or behavior identifier used in manager messages.",
    inactiveflag: `Posts a MOOS variable-value flag when this ${owner} instance becomes inactive.`,
    ipf_type: `Selects the IvP function construction method for ${owner}, such as ZAIC or reflector-based generation.`,
    label: "Sets the label used in the behavior's visualization.",
    label_color: "Sets the label color for the behavior's visualization.",
    lcolor: "Sets the label color for the behavior's visualization.",
    lead_condition: "Controls lead/capture behavior for waypoint trackline following.",
    leg_length: "Sets the length of the leg-run track.",
    leg_length_mod: "Applies a runtime adjustment to the leg-run track length.",
    line_pct: "Sets the percentage location along the bearing line used by the behavior.",
    mark_duration: "Sets how long a full-stop mark remains active.",
    max_heading_window: "Sets the upper bound of the heading hysteresis window.",
    max_mark_range: "Sets the farthest contact range at which convoy mark points are retained.",
    max_patience: "Sets the maximum patience before the behavior changes strategy or gives up.",
    max_speed: "Sets the maximum permitted speed.",
    max_stem_dist: "Sets the maximum stem distance before the zig-zag pattern ends.",
    max_time: `Sets the timeout duration for ${owner}.`,
    max_window_utility: "Sets the maximum utility assigned inside the hysteresis window.",
    memory_time: "Sets how long heading history is retained for hysteresis or turn-limit calculations.",
    mhddg: "Sets the desired heading for the fixed-turn behavior.",
    midpct: "Sets the percentage point used for mid-leg or mid-turn flag posting.",
    min_altitude: "Sets the minimum allowed altitude above bottom.",
    min_heading_window: "Sets the lower bound of the heading hysteresis window.",
    missing_altitude_critical: "Treats missing altitude data as a critical safety condition.",
    mod_hdg: "Applies a runtime modification to the fixed-turn heading.",
    mod_poly_rad: "Applies a runtime modification to the loiter polygon radius.",
    mod_trail_range: "Applies a runtime adjustment to the desired trail range.",
    mod_trail_range_pct: "Applies a percentage-based runtime adjustment to the desired trail range.",
    n_alert_request: "Suppresses automatic contact-manager alert requests.",
    name: `Sets the unique behavior instance name for ${owner}.`,
    newpt: "Adds or replaces a waypoint point at runtime.",
    nextpt_color: "Sets the color used to draw the next waypoint point.",
    nextpt_lcolor: "Sets the label color used for the next waypoint point.",
    nextpt_vertex_size: "Sets the vertex size used for the next waypoint point.",
    nm_radius: "Sets the radius for declaring no-more/arrival completion.",
    no_alert_request: "Suppresses automatic alert requests to the contact or obstacle manager.",
    obid: "Matches an obstacle by obstacle id.",
    obstacle_id: "Matches an obstacle by obstacle id.",
    obstacle_key: "Matches an obstacle by obstacle key.",
    opregion_poly_var: "Names the MOOS variable used to publish the operating-region polygon.",
    osx: "Sets the ownship x-coordinate supplied to the objective function.",
    osy: "Sets the ownship y-coordinate supplied to the objective function.",
    osh: "Sets the ownship heading supplied to geometry calculations.",
    oslat: "Sets the ownship latitude used by contact-geometry calculations.",
    oslon: "Sets the ownship longitude used by contact-geometry calculations.",
    osv: "Sets the ownship speed supplied to geometry calculations.",
    patience: "Sets how long the behavior tolerates lack of progress before adapting or completing.",
    passing_side: "Selects the side on which a COLREGS passing maneuver is evaluated.",
    pcheck_thresh: "Sets the plateau-check threshold used when validating generated IvP functions.",
    pending_status_variable: "Names the MOOS variable reporting a pending surface request.",
    perpetual: `Controls whether this ${owner} instance can complete or remains available.`,
    point: `Sets the target point for this ${owner} instance.`,
    portflagx: "Posts a flag when the extended port-side zig-zag event occurs.",
    post_mapping: "Maps behavior output posts to alternate MOOS variables.",
    post_per_contact_info: "Posts per-contact diagnostic information.",
    post_status_info_on_idle: "Keeps posting status information even while the behavior is idle.",
    priority: `Sets the priority weight used by the IvP Helm for this ${owner} instance.`,
    ptx: "Sets the target point x-coordinate supplied to the objective function.",
    pty: "Sets the target point y-coordinate supplied to the objective function.",
    pwt: `Sets the priority weight used by the IvP Helm for this ${owner} instance.`,
    radius: `Sets the radius threshold for ${owner}.`,
    radius_rep_var: "Names the MOOS variable used to report the fixed-turn radius.",
    range_estop: "Sets the convoy range at which emergency stopping is triggered.",
    range_lagging: "Sets the convoy range considered lagging behind the contact.",
    range_tailgating: "Sets the convoy range considered too close to the contact.",
    recover_speed: "Sets the speed used while recovering from an operating-region violation.",
    refine_piece: "Enables objective-function piece refinement.",
    reset_on_idle: "Resets waypoint progress when the behavior becomes idle.",
    reset_var: "Names the MOOS variable that resets recovery state.",
    req_hdg_color: "Sets the color used to draw the requested zig-zag heading.",
    rng_estop: "Sets the convoy emergency-stop range.",
    rng_lagging: "Sets the convoy lagging range.",
    rng_safety: "Sets the convoy safety range.",
    rng_tgating: "Sets the convoy tailgating range.",
    roc_max_dampen: "Limits how much rate-of-closure can dampen avoidance utility.",
    roc_max_heighten: "Limits how much rate-of-closure can heighten avoidance utility.",
    rstation_position: "Defines the relative station-keeping position.",
    save_dist: "Sets the distance from the operating-region boundary where save behavior begins.",
    schedule: "Defines the timing or sequence schedule for the behavior.",
    set_hdg_color: "Sets the color used to draw the commanded zig-zag heading.",
    shift_point: "Shifts the configured leg-run points by an x/y offset.",
    shortest_tour: "Requests shortest-tour ordering of waypoint points.",
    slingshot: "Enables loiter slingshot handling when approaching the polygon.",
    slow_dist: "Sets the distance from the next waypoint where slowing begins.",
    spawnx_flag: `Posts a flag when this ${owner} instance is spawned from a template.`,
    speed: `Sets the desired speed for this ${owner} behavior.`,
    speed_slack_var: "Names the MOOS variable that receives speed-slack reports.",
    speed_to_surface: "Sets the speed used while surfacing.",
    spd_basewidth: "Sets the speed objective-function base width.",
    spd_faster: "Sets the convoy speed multiplier used when the vehicle should speed up.",
    spd_max: "Sets the maximum convoy speed.",
    spd_peakwidth: "Sets the speed objective-function peak width.",
    spd_slower: "Sets the convoy speed multiplier used when the vehicle should slow down.",
    spoke_degs: "Sets the angular spacing of obstacle-avoidance candidate spokes.",
    spd_on_active: "Sets the speed command posted when the zig-zag behavior becomes active.",
    starflagx: "Posts a flag when the extended starboard-side zig-zag event occurs.",
    status_suffix: "Sets the suffix used on timer status variables.",
    stop_dist: "Sets the distance from the next waypoint where stopping is requested.",
    stop_thresh: "Sets the speed threshold for considering the vehicle stopped.",
    templating: `Marks this ${owner} block as a template configuration rather than an ordinary running instance.`,
    them: `Names the contact vehicle targeted by this ${owner} instance.`,
    time_on_leg: "Sets how long the vehicle remains on a heading-speed leg.",
    tol: "Sets the tolerance used when comparing target/contact geometry.",
    tolerance: `Sets the tolerance band for ${owner}.`,
    turn_model_degs: "Sets the turn-model angle increment used for obstacle-avoidance trajectory sampling.",
    turn_radius: "Sets the assumed turning radius for maneuver feasibility checks.",
    turn_speed: "Sets the speed used during the heading-change turn.",
    turn_type: "Selects the turn style used for the heading-change maneuver.",
    uniform_piece: "Requests uniform IvP function pieces for waypoint objective generation.",
    uniform_amount: "Sets the amount of uniformity applied to generated objective-function pieces.",
    uniform_grid: "Requests a uniform obstacle-avoidance sampling grid.",
    updates: `Names the MOOS variable used for runtime updates to this ${owner} instance.`,
    use_refinery: "Enables objective-function refinement for faster or smaller avoidance functions.",
    verbose: `Enables verbose reporting for ${owner}.`,
    vertex_color: "Sets the vertex color for the behavior's visualization.",
    vertex_size: "Sets the vertex size for the behavior's visualization.",
    visual_hints: `Overrides visual rendering hints posted by this ${owner} instance.`,
    vsource: "Matches an obstacle by visualization/source identifier.",
    var_status_idle: "Names the MOOS variable posted when the timer is idle.",
    var_status_running: "Names the MOOS variable posted when the timer is running.",
    vx1: "Sets the x-coordinate of the first leg-run vertex.",
    vx2: "Sets the x-coordinate of the second leg-run vertex.",
    warn_overshoot: "Enables warnings when the vehicle overshoots the leg-run track.",
    wpt_dist_to_next: "Reports or uses the distance to the next waypoint.",
    wpt_dist_to_prev: "Reports or uses the distance to the previous waypoint.",
    wpt_index: "Reports or sets the current waypoint index.",
    wpt_status: "Reports waypoint behavior status.",
    wptflag_on_start: "Posts the waypoint flag when starting a waypoint leg.",
    xpoints: "Defines the waypoint point list."
  };
  if (exact[lower]) return exact[lower];

  if (lower.endsWith("flag") || lower.includes("_flag")) {
    const event = phrase.replace(/\bflag\b/i, "").trim();
    return `Posts a MOOS variable-value flag for ${event || "this behavior event"}.`;
  }
  if (lower.endsWith("_var") || lower.includes("variable")) return `Names the MOOS variable for ${phrase.replace(/\bvariable\b/i, "").trim()}.`;
  if (lower.includes("post_mapping")) return "Maps behavior output posts to alternate MOOS variables.";
  if (lower.includes("contact") || lower === "them") return `Configures the contact target for ${owner}.`;
  if (lower.includes("extrapolate") || lower.includes("decay")) return `Sets stale-contact extrapolation handling for ${phrase}.`;
  if (lower.includes("ignore")) return `Ignores contacts matching the configured ${phrase.replace(/^ignore /, "")}.`;
  if (lower.includes("match")) return `Accepts only contacts matching the configured ${phrase.replace(/^match /, "")}.`;
  if (lower.includes("filter")) return `Applies the configured contact or region filter for ${phrase}.`;
  if (lower.includes("range") || lower.includes("dist") || lower.includes("radius")) return `Sets the ${phrase} threshold or distance.`;
  if (lower.includes("speed") || lower.includes("spd")) return `Sets the ${phrase}.`;
  if (lower.includes("heading") || lower.includes("hdg") || lower.includes("course") || lower.includes("crs")) return `Sets the ${phrase}.`;
  if (lower.includes("depth") || lower.includes("altitude")) return `Sets the ${phrase}.`;
  if (lower.includes("polygon") || lower.includes("poly") || lower.includes("region")) return `Defines the ${phrase}.`;
  if (lower.includes("point") || lower.includes("lat") || lower.includes("lon") || lower === "ptx" || lower === "pty" || lower === "osx" || lower === "osy") return `Sets the ${phrase} coordinate or point.`;
  if (lower.includes("time") || lower.includes("duration") || lower.includes("delay") || lower.includes("interval")) return `Sets the ${phrase}.`;
  if (lower.includes("turn") || lower.includes("zig") || lower.includes("zag")) return `Shapes the ${phrase} maneuver.`;
  if (lower.includes("lead") || lower.includes("capture") || lower.includes("slip")) return `Controls waypoint/trackline capture through ${phrase}.`;
  if (lower.includes("zaic") || lower.includes("basewidth") || lower.includes("peakwidth") || lower.includes("summit")) return `Shapes the IvP objective function through ${phrase}.`;
  if (lower.includes("color")) return `Sets the display color for ${phrase.replace(/\bcolor\b/i, "").trim()}.`;
  if (lower.includes("label")) return `Sets the display label for ${phrase.replace(/\blabel\b/i, "").trim()}.`;
  if (lower.includes("show") || lower.includes("draw")) return `Toggles drawing or display of ${phrase.replace(/^(show|draw) /, "")}.`;
  return `Sets the ${phrase} option for ${owner}.`;
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
