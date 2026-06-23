# MOOS-IvP Editor Examples

This directory contains canonical example files for developing the MOOS-IvP
Editor extension.

The examples intentionally focus on file types that appear in real MOOS-IvP
mission and harness workflows:

- `.moos`: MOOS mission/configuration files, including `meta_*.moos`,
  `plug_*.moos`, and generated `targ_*.moos` conventions.
- `.bhv`: IvP behavior configuration files, including `meta_*.bhv` and
  generated `targ_*.bhv` conventions.
- `.xmoos`: MOOS patch inputs for `nspatch`.
- `.xbhv`: behavior patch inputs for `nspatch`.

Local searches found many `plug_*.moos` and `meta_*.moos` files, but no
canonical `*.plug` or `*.meta` extension usage. The examples therefore model
the prefix conventions instead of inventing separate `.plug` or `.meta` files.

Representative fixtures:

- `meta_vehicle.moos`: MOOS mission template with pAntler and app blocks.
- `meta_vehicle.bhv`: IvP behavior template with mode declarations and behavior
  blocks.
- `plug_pMarineViewer.moos`: include fragment using the real `plug_*.moos`
  convention.
- `patch_shoreside.xmoos`: MOOS patch input for `nspatch`.
- `patch_vehicle.xbhv`: behavior patch input for `nspatch`.

Broad coverage fixtures:

- `all_apps.moos`: generated MOOS app/config block and parameter inventory.
- `all_behaviors.bhv`: generated IvP behavior and parameter inventory.

The broad coverage fixtures are useful for syntax and hover review, but they
are not runnable missions.

Diagnostic observation fixtures:

- `geometry_diagnostics_observe.bhv`: paired good, bad, skipped, and
  block-specific IvP behavior geometry examples.
- `geometry_diagnostics_observe.moos`: paired good, bad, skipped, and
  block-specific MOOS app geometry examples.
- `formatting_linter_demo.moos`: intentionally messy spacing and indentation
  for observing formatting diagnostics, Quick Fix, and Format Document.

The observation fixtures intentionally contain bad values so diagnostics can be
seen in VS Code. They are excluded from the normal zero-diagnostic example gate.
