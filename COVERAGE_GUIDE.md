# Coverage Guide

Use this when adding a known app/behavior, parameter, hover description, or
diagnostic.

## Rules

- Use local MOOS-IvP source as ground truth for diagnostics.
- Prefer source or MIT docs for hover text. Do not write guesses.
- Keep diagnostics block-specific.
- Do not warn on syntax that may be valid but is not fully modeled.
- Run `npm run check` before committing.

## Add A Known App Or Behavior

1. Confirm the app/behavior exists in local MOOS-IvP source.
2. Add or update its manual metadata in `data/parameter-overrides.json` if the
   generated inventory is missing or weak.
3. Use the correct top-level group:
   - MOOS app: `moos`
   - IvP behavior: `ivp-behavior`
4. Add `reviewStatus`, `reviewSource`, and `parameters`.
5. Run:

```sh
npm run build:data
npm run check
```

## Add A Parameter Hover Description

Edit `data/parameter-overrides.json`.

Shape:

```json
{
  "moos": {
    "pExampleApp": {
      "reviewStatus": "manual-reviewed",
      "reviewSource": "moos-ivp/ivp/src/pExampleApp/Example.cpp",
      "parameters": {
        "example_param": {
          "description": "Short user-facing meaning.",
          "default": "10",
          "example": "example_param = 10",
          "reviewSource": "moos-ivp/ivp/src/pExampleApp/Example.cpp:42-48"
        }
      }
    }
  }
}
```

Use lowercase parameter keys. Preserve the real spelling in `example`.

Then run:

```sh
npm run build:data
npm run check
```

## Add A Diagnostic

Edit `data/diagnostic-schema.json`.

Use owner-specific entries unless the parameter is parsed by a shared base
class.

MOOS app shape:

```json
{
  "apps": {
    "pExampleApp": {
      "source": "moos-ivp/ivp/src/pExampleApp/Example.cpp",
      "parameters": {
        "example_param": {
          "valueType": "number",
          "constraints": {
            "minimum": 0,
            "minimumExclusive": false
          },
          "default": "10",
          "diagnostic": true,
          "confidence": "source-enforced",
          "source": [
            "moos-ivp/ivp/src/pExampleApp/Example.cpp:42-48"
          ]
        }
      }
    }
  }
}
```

IvP behavior shape:

```json
{
  "behaviors": {
    "BHV_Example": {
      "source": "moos-ivp/ivp/src/lib_behaviors-marine/BHV_Example.cpp",
      "parameters": {
        "example_param": {
          "valueType": "boolean-token",
          "constraints": {
            "enum": ["true", "false"],
            "caseInsensitive": true
          },
          "diagnostic": true,
          "confidence": "source-enforced",
          "source": [
            "moos-ivp/ivp/src/lib_behaviors-marine/BHV_Example.cpp:42-48"
          ]
        }
      }
    }
  }
}
```

Set `diagnostic: false` when source coerces, accepts broad strings, or uses a
complex parser that is not modeled.

## Add A New Diagnostic Value Type

1. Add validation logic in `src/language-support.js`.
2. Add expected text in `expectedDescription()`.
3. Add focused fixtures under `scripts/`.
4. Wire the fixture script into `package.json` if it is a new script.
5. Add good/bad examples if visual review helps.
6. Run:

```sh
npm run check
```

## Verify

Minimum checklist:

```sh
npm run build:data
npm run check
npx @vscode/vsce package --out /tmp/moos-ivp-editor-check.vsix
```

For observation fixtures, intentional diagnostics are allowed. For
`examples/all_apps.moos` and `examples/all_behaviors.bhv`, diagnostics must stay
at zero.
