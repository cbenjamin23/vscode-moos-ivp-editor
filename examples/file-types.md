# MOOS-IvP File Type Notes

This extension should focus on canonical MOOS-IvP configuration and patch
files.

## Primary Associations

- `.moos`: MOOS mission/configuration syntax. This includes ordinary mission
  files, `meta_*.moos` nsplug templates, `plug_*.moos` include fragments, and
  generated `targ_*.moos` files.
- `.bhv`: IvP Helm behavior syntax. This includes ordinary behavior files,
  `meta_*.bhv` nsplug templates, and generated `targ_*.bhv` files.
- `.xmoos`: MOOS patch input files consumed by `nspatch`.
- `.xbhv`: behavior patch input files consumed by `nspatch`.

## Patch And Sidecar Workflow

The `x` position matters:

- `.xmoos` and `.xbhv` are patch inputs. Authors or harnesses provide these to
  `nspatch`.
- `.moosx` and `.bhvx` are sidecar outputs. `nspatch` can generate these, and
  `nsplug -x` consumes them.

Typical flow:

```text
meta_vehicle.moos + patch.xmoos -> meta_vehicle.moosx -> nsplug -x -> targ_abe.moos
meta_vehicle.bhv  + patch.xbhv  -> meta_vehicle.bhvx  -> nsplug -x -> targ_abe.bhv
```

For editor behavior, `.xmoos` should be treated like `.moos`, and `.xbhv`
should be treated like `.bhv`. If `.moosx` or `.bhvx` support is added later
for generated sidecars, they should follow the same MOOS/BHV grammar split.

## Non-Canonical Or Compatibility Candidates

- `.moosx` and `.bhvx`: Generated sidecar files consumed by `nsplug -x`.
  They use MOOS/BHV syntax, but they are generated artifacts rather than
  primary authoring files.
- `.plug`: Not observed in the searched local MOOS-IvP trees. The real
  convention appears to be `plug_*.moos` or `plugs.moos`.
- `.meta`: Not observed in the searched local MOOS-IvP trees. The real
  convention appears to be `meta_*.moos` and `meta_*.bhv`.
- `.moos++`: Seen in local mission folders with regular MOOS configuration
  content. Do not add support until we confirm whether this is a stable user
  convention or generated backup/output.
- `._moos` and `._bhv`: pLogger may copy mission files into log directories
  with underscore-prefixed extensions. These are generated log artifacts rather
  than authoring targets.

## Probably Out Of Scope

- `.sh`: Shell launch and cleanup scripts. VS Code already highlights these as
  shell scripts.
- `.cpp`, `.h`, `.hpp`: MOOS apps and IvP behavior source code. VS Code already
  highlights these as C/C++.
- `.alog`, `.blog`, `.ylog`, `.slog`, `.xlog`: Generated log artifacts. They
  are important for analysis tooling, but they are not configuration files.
- `.cfd`, `.opf`, `.alogview`: Specialized data/viewer files. They may deserve
  separate support later, but they should not block the first syntax/hover pass.
