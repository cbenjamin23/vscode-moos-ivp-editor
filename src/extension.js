const { registerLanguageSupport } = require("./language-support");

function activate(context) {
  registerLanguageSupport(context);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
