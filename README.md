# MOOS-IvP Editor

VS Code language support for MOOS-IvP mission, behavior, and patch files.

This extension is intentionally static. It ships bundled MOOS-IvP metadata and
does not call an AI model at runtime.

## Features

- TextMate syntax highlighting for MOOS and IvP behavior file structure.
- Semantic highlighting for known apps, behaviors, directives, and parameters.
- Block-aware parameter classification inside `ProcessConfig = ...` and
  `Behavior = ...` blocks.
- Hover help for known apps, behaviors, and parameters.
- Conservative diagnostics for source-backed value mistakes.
- Support for MOOS-IvP patch conventions used by `nspatch`.

## File Types

| Extension | Language mode | Notes |
| --- | --- | --- |
| `.moos` | MOOS | Mission/config files, `meta_*.moos`, `plug_*.moos`, generated target files. |
| `.xmoos` | MOOS | MOOS patch input files for `nspatch`. |
| `.bhv` | IvP Behavior | Behavior files, `meta_*.bhv`, generated target files. |
| `.xbhv` | IvP Behavior | Behavior patch input files for `nspatch`. |

The extension does not register separate `.plug` or `.meta` extensions. In
MOOS-IvP missions those are normally prefix conventions, such as
`plug_pMarineViewer.moos` and `meta_vehicle.bhv`.

## Diagnostics

Diagnostics are deliberately conservative.

The extension warns only when the bundled schema is backed by local MOOS-IvP
source behavior. If a value may be valid but the parser is not fully modeled,
the extension skips it instead of warning.

Current diagnostic coverage includes:

- Block-specific type/range checks for selected source-backed parameters.
- Convex polygon checks for selected behavior polygon parameters.
- Waypoint path syntax checks for selected `BHV_Waypoint` parameters.
- Contact filter region checks for selected behavior and `pContactMgrV20`
  parameters.

Known limitation: advanced/generated geometry syntax such as `radial:`,
`ellipse:`, `zigzag:`, and `lawnmower:` is accepted/skipped unless a
source-equivalent parser has been modeled and fixture-tested.

## Examples

The `examples/` directory contains:

- Canonical MOOS, behavior, patch, meta, and plug-style examples.
- Broad coverage fixtures: `all_apps.moos` and `all_behaviors.bhv`.
- Intentional diagnostic observation fixtures:
  - `geometry_diagnostics_observe.bhv`
  - `geometry_diagnostics_observe.moos`

The observation fixtures are not runnable missions. They intentionally contain
good, bad, skipped, and wrong-block examples so diagnostics can be reviewed in
VS Code.

## Install From VSIX

Build a local VSIX:

```sh
npx @vscode/vsce package
```

Install it:

```sh
code --install-extension moos-ivp-editor-0.0.3.vsix
```

Reload VS Code after installing or replacing the extension.

## Development

Run the full local check:

```sh
npm run check
```

Regenerate bundled metadata after changing source inventory or hover override
inputs:

```sh
npm run build:data
```

Main runtime files:

- `src/language-support.js`: semantic tokens, hover providers, diagnostics.
- `data/parameter-overrides.json`: manual hover/description overrides.
- `data/diagnostic-schema.json`: source-backed diagnostic contracts.
- `syntaxes/*.tmLanguage.json`: baseline TextMate grammars.

Coverage additions are described in `COVERAGE_GUIDE.md`.

## Project Links

- [MOOS-IvP homepage](https://oceanai.mit.edu/moos-ivp)
- [pAntler documentation](https://oceanai.mit.edu/ivpman/pmwiki/pmwiki.php?n=IvPTools.PAntler)
