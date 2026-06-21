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
