const FEATURE_TOGGLES = [
  {
    key: "diagnostics.enabled",
    label: "Diagnostics",
    detail: "Source-backed MOOS-IvP configuration diagnostics."
  },
  {
    key: "diagnostics.geometry.enabled",
    label: "Geometry Diagnostics",
    detail: "Polygon and point-list diagnostics for modeled geometry values."
  },
  {
    key: "folding.enabled",
    label: "Folding",
    detail: "ProcessConfig and Behavior block folding."
  },
  {
    key: "formatting.enabled",
    label: "Formatting",
    detail: "Format Document support and formatting quick fixes."
  },
  {
    key: "formatting.diagnostics.enabled",
    label: "Formatting Diagnostics",
    detail: "Warnings for spacing, indentation, blank lines, and trailing whitespace."
  },
  {
    key: "hover.enabled",
    label: "Hover Descriptions",
    detail: "Hover text for known apps, behaviors, and parameters."
  },
  {
    key: "semanticHighlighting.enabled",
    label: "Semantic Highlighting",
    detail: "MOOS-IvP-aware highlighting for known apps, behaviors, and parameters."
  }
];

function featureItem(config, feature) {
  const enabled = config.get(feature.key, true);
  return {
    label: feature.label,
    description: enabled ? "On" : "Off",
    detail: feature.detail,
    picked: enabled,
    feature
  };
}

async function configureFeatures(vscode) {
  const config = vscode.workspace.getConfiguration("moosIvpEditor");
  const items = FEATURE_TOGGLES.map((feature) => featureItem(config, feature));
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    ignoreFocusOut: true,
    placeHolder: "Select MOOS-IvP features to enable"
  });

  if (!selected) {
    return;
  }

  const enabledKeys = new Set(selected.map((item) => item.feature.key));
  await Promise.all(FEATURE_TOGGLES.map((feature) => (
    config.update(
      feature.key,
      enabledKeys.has(feature.key),
      vscode.ConfigurationTarget.Global
    )
  )));

  if (vscode.window.showInformationMessage) {
    vscode.window.showInformationMessage("MOOS-IvP feature settings updated.");
  }
}

function registerFeatureToggleCommands(vscode, context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("moosIvpEditor.configureFeatures", () => (
      configureFeatures(vscode)
    ))
  );
}

module.exports = {
  FEATURE_TOGGLES,
  configureFeatures,
  registerFeatureToggleCommands
};
