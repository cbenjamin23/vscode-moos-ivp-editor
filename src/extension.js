const { registerLanguageSupport } = require("./language-support");
const { registerFeatureToggleCommands } = require("./feature-toggles");

function activate(context) {
  registerFeatureToggleCommands(require("vscode"), context);
  registerLanguageSupport(context);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
