# Contributing to MOOS-IvP Editor

This guide covers local development, coverage changes, validation, and releases.

## Development

1. Clone the repository.
2. Open it in VS Code.
3. Press `F5` to launch the Extension Development Host.
4. Test with `.moos`, `.xmoos`, `.bhv`, and `.xbhv` files.
5. Run `npm run check` before committing.

There is no compile step for normal extension development.

## Architecture

Keep feature logic in the focused module:

- `src/language-support.js`: VS Code provider registration and API glue.
- `src/scanner.js`: comments, block matching, assignments, and owner state.
- `src/registry.js`: metadata loading and lookup construction.
- `src/hover.js`: hover content.
- `src/semantic-tokens.js`: semantic highlighting.
- `src/folding.js`: block folding.
- `src/formatter.js`: formatting and formatting diagnostics.
- `src/diagnostics.js`: document diagnostic collection.
- `src/validators.js`: general schema value validation.
- `src/geometry.js`: geometry parsing and geometry validation.

Avoid adding feature logic to `src/language-support.js` unless the change needs
direct VS Code API wiring.

## Metadata

The bundled MOOS-IvP metadata is a reviewed snapshot. Prefer targeted fixes for
small hover, highlighting, diagnostic, or formatting changes.

Use `npm run build:data` only when intentionally refreshing generated metadata
from source or docs. Review generated diffs carefully, especially:

- `data/*-docs.json`
- `data/*-source.json`
- broad example fixtures

Use `data/parameter-overrides.json` for curated human-reviewed corrections that
should survive regeneration: descriptions, examples, defaults, aliases, and
false-positive fixes.

## Expanding Coverage

Use local MOOS-IvP source as ground truth for diagnostics. Prefer source or MIT
docs for hover text. Do not write guesses.

Keep diagnostics block-specific and conservative. Do not warn on syntax that may
be valid but is not fully modeled.

### Add An App Or Behavior

1. Confirm it exists in local MOOS-IvP source.
2. Add or update manual metadata in `data/parameter-overrides.json` if generated
   inventory is missing or weak.
3. Use `moos` for MOOS apps and `ivp-behavior` for IvP behaviors.
4. Add `reviewStatus`, `reviewSource`, and `parameters`.
5. Run `npm run build:data && npm run check`.

### Add A Hover Description

Edit `data/parameter-overrides.json`.

Use lowercase parameter keys. Preserve the real spelling in examples. Include a
short description, default/example when known, and a source or docs reference.

Then run `npm run build:data && npm run check`.

### Add A Diagnostic

Edit `data/diagnostic-schema.json`.

Use owner-specific entries unless the parameter is parsed by a shared base
class. Set `diagnostic: false` when source coerces values, accepts broad
strings, or uses a complex parser that is not modeled.

For new value types:

1. Add general validation in `src/validators.js`.
2. Add geometry-specific parsing or validation in `src/geometry.js`.
3. Update `src/diagnostics.js` only if traversal or schema lookup changes.
4. Touch `src/language-support.js` only for new VS Code API wiring.
5. Add focused fixtures under `scripts/`.
6. Wire new fixture scripts into `package.json`.
7. Run `npm run check`.

## Validation

Minimum validation before committing:

```sh
npm run check
npx @vscode/vsce package --out /tmp/moos-ivp-editor-check.vsix
```

Run `npm run build:data` first when intentionally changing generated metadata.

Intentional diagnostics are allowed in observation fixtures. Diagnostics must
stay at zero for `examples/all_apps.moos` and `examples/all_behaviors.bhv`.

## Releases

GitHub Actions builds and packages the extension on pushes and pull requests.
It publishes to the VS Code Marketplace when a GitHub Release is created.

Publishing requires a repository secret named `VSCE_PAT`. Create it in Azure
DevOps with Marketplace `Acquire` and `Manage` scopes, then add it under GitHub
Actions secrets.

To release:

1. Update the version in `package.json`.
2. Commit the change.
3. Create and push a tag, for example `git tag v1.0.1 && git push origin v1.0.1`.
4. Create a GitHub Release from the tag.

The extension publishes under the `moos-ivp` Marketplace publisher.

## Code Style

Prefer focused changes, source-backed metadata, and targeted validation over
broad rewrites.
