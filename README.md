# MOOS-IvP Editor for VS Code

[![CI/CD](https://github.com/moos-ivp/vscode-moos-ivp-editor/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/moos-ivp/vscode-moos-ivp-editor/actions/workflows/ci-cd.yml)

The MOOS-IvP Editor extension for Visual Studio Code adds syntax highlighting
and hover help for MOOS mission files, IvP behavior files, and MOOS-IvP patch
files. Syntax highlighting has limited error detection. Semantic highlighting
adds owner-aware classification for known apps, behaviors, and parameters while
leaving values and ambiguous bare identifiers to the existing TextMate grammar
and active VS Code theme.

## Features

### MOOS Mission Files

* Syntax Highlighting
  * Global variables
  * `pAntler` block
  * Generalized application block
* Semantic classification for known apps and parameters valid in the current
  `ProcessConfig` block
* Hover help for known MOOS apps and parameters, preferring MIT doc-backed
  descriptions and using local source-backed descriptions for undocumented
  entries

![MOOS Mission File](https://raw.githubusercontent.com/cgagner/vscode-moos-ivp-editor/main/images/example_mission.png)

### IvP Behavior Files

* Syntax Highlighting
  * Initialize statements
  * Set statements
  * Behavior blocks - Highlights inherited options
* Semantic classification for known behaviors and parameters valid in the
  current `Behavior` block
* Hover help for known IvP behaviors and parameters, preferring MIT doc-backed
  descriptions and using local source-backed descriptions for undocumented
  entries

![IvP Behavior File](https://raw.githubusercontent.com/cgagner/vscode-moos-ivp-editor/main/images/example_behavior.png)

### pAntler Options

For more information on the `pAntler` options, see: 
https://oceanai.mit.edu/ivpman/pmwiki/pmwiki.php?n=IvPTools.PAntler

## Requirements

This extension requires Visual Studio Code `1.32` or later. It is also
recommended that MOOS-IvP be installed on the system. The 
[Remote SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh)
extension by Microsoft is also recommended in order to edit MOOS mission files
and IvP behavior files that are located on a remote system such as a vehicle
or robot.

## Extension Settings

This extension currently doesn't have any settings. However, that is expected
to change in the future. This section will be updated when settings have been
added.

## Known Issues

* Broad inventory examples are coverage fixtures, not runnable missions.
* Source-backed hover descriptions are generated from local MOOS-IvP source
  inventory when MIT docs do not define a parameter directly.

## Development Examples

Example files for grammar and language-feature development are in
`examples/`. The examples focus on canonical MOOS-IvP authoring and patch
files: `.moos`, `.bhv`, `.xmoos`, and `.xbhv`.


## Release Notes

### 0.0.1

Initial release of the moos-ivp-editor extension for VS Code.

## For more information

* [MOOS-IvP Homepage](https://oceanai.mit.edu/moos-ivp)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)
