# MOOS-IvP Editor for VS Code

[![CI/CD](https://github.com/moos-ivp/vscode-moos-ivp-editor/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/moos-ivp/vscode-moos-ivp-editor/actions/workflows/ci-cd.yml)

The MOOS-IvP Editor extension for Visual Studio Code adds syntax highlighting
and hover help for MOOS mission files, IvP behavior files, and MOOS-IvP patch
files. Semantic highlighting adds owner-aware classification for known apps,
behaviors, and parameters while leaving values and ambiguous bare identifiers to
the existing TextMate grammar and active VS Code theme.

The extension also provides conservative diagnostics for source-backed
configuration mistakes. Diagnostics are block-aware and intentionally narrow:
they warn only when local MOOS-IvP source behavior is clear enough to avoid
false positives.

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
* Conservative diagnostics for source-backed value constraints, including
  selected `pContactMgrV20` contact filter region geometry checks

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
* Conservative diagnostics for source-backed value constraints, including
  selected convex polygon, waypoint path, and contact filter region checks

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
* Geometry diagnostics intentionally skip advanced/generated geometry syntax
  that is valid in MOOS-IvP but not yet fully modeled by this extension.
* Source-backed hover descriptions are generated from local MOOS-IvP source
  inventory when MIT docs do not define a parameter directly.

## Development Examples

Example files for grammar and language-feature development are in
`examples/`. The examples focus on canonical MOOS-IvP authoring and patch
files: `.moos`, `.bhv`, `.xmoos`, and `.xbhv`.

Use `npm run build:data` after changing inventory, source-description, or
override inputs. Use `npm run check` before reviewing or committing generated
metadata and runtime changes.

Intentional good/bad diagnostic observation files are also provided:

* `examples/geometry_diagnostics_observe.bhv`
* `examples/geometry_diagnostics_observe.moos`

These files are not runnable missions. They are meant to show which geometry
values should and should not produce diagnostics.


## Release Notes

### 0.0.1

Initial release of the moos-ivp-editor extension for VS Code.

## For more information

* [MOOS-IvP Homepage](https://oceanai.mit.edu/moos-ivp)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)
