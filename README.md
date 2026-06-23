# MOOS-IvP Editor for VS Code

[![CI/CD](https://github.com/moos-ivp/vscode-moos-ivp-editor/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/moos-ivp/vscode-moos-ivp-editor/actions/workflows/ci-cd.yml)

The MOOS-IvP Editor extension for Visual Studio Code adds syntax highlighting,
hover descriptions, semantic highlighting, and conservative diagnostics for
MOOS mission files, IvP behavior files, and MOOS-IvP patch files.

It supports `.moos`, `.xmoos`, `.bhv`, and `.xbhv` files. The `.xmoos` and
`.xbhv` modes cover patch inputs commonly used with `nspatch`; `plug_*.moos`
and `meta_*.moos`/`meta_*.bhv` files are handled by their normal `.moos` and
`.bhv` extensions.

## Features

### Syntax Highlighting

Baseline TextMate grammars highlight MOOS and IvP behavior file structure:
comments, block headers, assignments, braces, directives, and common language
forms.

Semantic highlighting adds MOOS-IvP-aware classification for known apps,
behaviors, and parameters. Parameter highlighting is block-aware, so a
parameter is only classified as known when it belongs to the current
`ProcessConfig` or `Behavior` block.

<!-- TODO: Add syntax highlighting example image. -->

### Hover Descriptions

Hover text provides concise descriptions for known apps, behaviors, and
parameters. Descriptions are bundled with the extension and are derived from
MIT MOOS-IvP documentation, local MOOS-IvP source, and reviewed manual
overrides.

Where available, hovers include examples, defaults, source references, and
documentation links.

<!-- TODO: Add hover description example image. -->

### Diagnostics

Diagnostics warn on selected source-backed configuration mistakes, including
some type/range errors, convex polygon errors, waypoint path syntax errors, and
contact filter region errors.

Diagnostics are intentionally conservative. If the MOOS-IvP source accepts a
broad value, coerces invalid input, or uses syntax the extension has not fully
modeled, the extension skips the warning instead of guessing.

<!-- TODO: Add diagnostics example image. -->

## Requirements

- Visual Studio Code `1.32` or later.
- No runtime MOOS-IvP install is required for the extension to load.
- A local MOOS-IvP checkout is useful for development and for expanding bundled
  metadata.

## Install

Build a local VSIX:

```sh
npx @vscode/vsce package
```

Install it:

```sh
code --install-extension moos-ivp-editor-1.0.0.vsix
```

Reload VS Code after installing or replacing the extension.

## Examples

The `examples/` directory contains canonical `.moos`, `.bhv`, `.xmoos`, and
`.xbhv` files for review.

Diagnostic observation files intentionally contain good, bad, skipped, and
wrong-block examples:

- `examples/geometry_diagnostics_observe.bhv`
- `examples/geometry_diagnostics_observe.moos`

These observation files are not runnable missions.

## Development

Run checks:

```sh
npm run check
```

Regenerate bundled metadata after changing source inventory or hover override
inputs:

```sh
npm run build:data
```

Main files:

- `src/language-support.js`: semantic tokens, hover providers, diagnostics.
- `syntaxes/*.tmLanguage.json`: baseline TextMate grammars.
- `data/parameter-overrides.json`: manual hover/description overrides.
- `data/diagnostic-schema.json`: source-backed diagnostic contracts.
- `COVERAGE_GUIDE.md`: concise instructions for adding coverage.

## Links

- [MOOS-IvP homepage](https://oceanai.mit.edu/moos-ivp)
- [pAntler documentation](https://oceanai.mit.edu/ivpman/pmwiki/pmwiki.php?n=IvPTools.PAntler)
