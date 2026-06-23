const {
  isNumberLiteral,
  validateGeometryValue
} = require("./geometry");

const GEOMETRY_VALUE_TYPES = new Set([
  "convex-polygon",
  "contact-filter-region",
  "seglist",
  "seglist-or-polygon",
  "waypoint-segment-list-or-polygon"
]);

function lower(value) {
  return value.toLowerCase();
}

function stripValue(value) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function expectedNumberDescription(constraints) {
  const parts = [];
  const numberKind = constraints.integer ? "integer" : "number";
  const article = constraints.integer ? "an" : "a";
  if (constraints.minimum !== undefined) {
    parts.push(`${constraints.minimumExclusive ? ">" : ">="} ${constraints.minimum}`);
  }
  if (constraints.maximum !== undefined) {
    parts.push(`${constraints.maximumExclusive ? "<" : "<="} ${constraints.maximum}`);
  }

  return parts.length ? `${article} ${numberKind} ${parts.join(" and ")}` : `${article} ${numberKind}`;
}

function expectedNumberRangeDescription(constraints) {
  const numberDescription = expectedNumberDescription(constraints);
  return `${numberDescription} or ${numberDescription}:${numberDescription} with the left value <= the right value`;
}

function expectedDescription(entry) {
  const constraints = entry.constraints || {};
  if (entry.valueType === "enum") {
    return `one of: ${(constraints.enum || []).join(", ")}`;
  }
  if (entry.valueType === "boolean-token") {
    return `one of: ${(constraints.enum || []).join(", ")}`;
  }
  if (entry.valueType === "number-or-enum") {
    const number = constraints.number || {};
    return `${expectedNumberDescription(number)}, or one of: ${(constraints.enum || []).join(", ")}`;
  }
  if (entry.valueType === "number-or-delta") {
    return "a number or delta:<number>";
  }
  if (entry.valueType === "number-or-adjustment") {
    return "a number, delta:<number>, or scale:<number>";
  }
  if (entry.valueType === "number-range") {
    return expectedNumberRangeDescription(constraints);
  }
  if (entry.valueType === "number") {
    return expectedNumberDescription(constraints);
  }
  if (entry.valueType === "number-pair-ascending") {
    return "two comma-separated numbers with the first >= 0 and <= the second";
  }
  if (entry.valueType === "number-pair") {
    return "two comma-separated numbers";
  }
  if (entry.valueType === "ip-address") {
    return "localhost or an IPv4 address with each field in 0..255";
  }
  if (entry.valueType === "tif-file") {
    return "a .tif file path with no spaces";
  }
  if (entry.valueType === "single-equals-pair") {
    return "a field=value pair with exactly one equals sign";
  }
  if (entry.valueType === "comma-list-no-whitespace") {
    return "a comma-separated list of non-empty items with no spaces or tabs";
  }
  if (entry.valueType === "no-whitespace-string") {
    return "a string with no spaces or tabs";
  }
  if (entry.valueType === "non-empty-string") {
    return "a non-empty string";
  }
  if (entry.valueType === "non-empty-no-whitespace-string") {
    return "a non-empty string with no spaces or tabs";
  }
  if (entry.valueType === "convex-polygon") {
    return "a source-supported convex polygon, such as pts={0,0:100,0:100,100:0,100} or 0,0:100,0:100,100:0,100";
  }
  if (entry.valueType === "contact-filter-region") {
    return "a source-supported convex region polygon, such as pts={0,0:100,0:100,100:0,100} or 0,0:100,0:100,100:0,100";
  }
  if (entry.valueType === "seglist") {
    return "a source-supported point list, such as pts={0,0:100,0} or 0,0:100,0";
  }
  if (entry.valueType === "seglist-or-polygon" || entry.valueType === "waypoint-segment-list-or-polygon") {
    return "empty, start, or a source-supported waypoint point list such as pts={0,0:100,0} or 0,0:100,0";
  }
  return entry.valueType || "a valid value";
}

function geometryFailureDescription(reason) {
  if (reason === "empty") {
    return "has an empty value";
  }
  if (reason === "malformed-standard-points") {
    return "has malformed pts={...} syntax";
  }
  if (reason === "malformed-point-list" || reason === "malformed-abbreviated-points") {
    return "has a malformed point list";
  }
  if (reason === "too-few-polygon-points") {
    return "has too few points for a polygon";
  }
  if (reason === "self-intersecting-polygon") {
    return "is self-intersecting";
  }
  if (reason === "non-convex-polygon") {
    return "is not convex";
  }
  if (reason === "empty-seglist") {
    return "has an empty point list";
  }
  return "has an invalid value";
}

function diagnosticMessage(name, expected) {
  if (typeof expected === "string") {
    return `${name} expects ${expected}.`;
  }
  return `${name} ${expected.reason}. Expected ${expected.expected}.`;
}

function numberSatisfiesConstraints(number, constraints) {
  if (constraints.minimum !== undefined) {
    if (constraints.minimumExclusive && !(number > constraints.minimum)) {
      return false;
    }
    if (!constraints.minimumExclusive && !(number >= constraints.minimum)) {
      return false;
    }
  }
  if (constraints.maximum !== undefined) {
    if (constraints.maximumExclusive && !(number < constraints.maximum)) {
      return false;
    }
    if (!constraints.maximumExclusive && !(number <= constraints.maximum)) {
      return false;
    }
  }
  return true;
}

function isGeometryValueType(valueType) {
  return GEOMETRY_VALUE_TYPES.has(valueType);
}

function validateSchemaValue(value, entry, options = {}) {
  if (!entry || entry.diagnostic !== true) {
    return undefined;
  }

  if (options.geometryEnabled === false && isGeometryValueType(entry.valueType)) {
    return undefined;
  }

  const raw = stripValue(value);
  const normalized = entry.constraints && entry.constraints.caseInsensitive
    ? lower(raw)
    : raw;

  if (entry.valueType === "enum" || entry.valueType === "boolean-token") {
    const allowed = (entry.constraints.enum || []).map((item) => (
      entry.constraints.caseInsensitive ? lower(item) : item
    ));
    return allowed.includes(normalized) ? undefined : expectedDescription(entry);
  }

  if (entry.valueType === "number") {
    if (!isNumberLiteral(raw)) {
      return expectedDescription(entry);
    }
    const number = Number(raw);
    if (entry.constraints && entry.constraints.integer && !Number.isInteger(number)) {
      return expectedDescription(entry);
    }
    if (!numberSatisfiesConstraints(number, entry.constraints || {})) {
      return expectedDescription(entry);
    }
    return undefined;
  }

  if (entry.valueType === "number-or-enum") {
    const allowed = (entry.constraints.enum || []).map((item) => (
      entry.constraints.caseInsensitive ? lower(item) : item
    ));
    if (allowed.includes(normalized)) {
      return undefined;
    }
    if (!isNumberLiteral(raw)) {
      return expectedDescription(entry);
    }
    const number = Number(raw);
    const numberConstraints = entry.constraints.number || {};
    if (numberConstraints.integer && !Number.isInteger(number)) {
      return expectedDescription(entry);
    }
    if (!numberSatisfiesConstraints(number, numberConstraints)) {
      return expectedDescription(entry);
    }
    return undefined;
  }

  if (entry.valueType === "number-or-delta") {
    if (isNumberLiteral(raw)) {
      return undefined;
    }
    if (lower(raw).startsWith("delta:")) {
      const delta = raw.slice(raw.indexOf(":") + 1).trim();
      return isNumberLiteral(delta) ? undefined : expectedDescription(entry);
    }
    return expectedDescription(entry);
  }

  if (entry.valueType === "number-or-adjustment") {
    if (isNumberLiteral(raw)) {
      return undefined;
    }
    const lowered = lower(raw);
    if (lowered.startsWith("delta:") || lowered.startsWith("scale:")) {
      const value = raw.slice(raw.indexOf(":") + 1).trim();
      return isNumberLiteral(value) ? undefined : expectedDescription(entry);
    }
    return expectedDescription(entry);
  }

  if (entry.valueType === "number-range") {
    const parts = raw.split(":").map((part) => part.trim());
    if (parts.length < 1 || parts.length > 2 || parts.some((part) => !isNumberLiteral(part))) {
      return expectedDescription(entry);
    }

    const first = Number(parts[0]);
    const second = parts.length === 2 ? Number(parts[1]) : first;
    if (!numberSatisfiesConstraints(first, entry.constraints || {})
      || !numberSatisfiesConstraints(second, entry.constraints || {})
      || first > second) {
      return expectedDescription(entry);
    }
    return undefined;
  }

  if (entry.valueType === "number-pair-ascending") {
    const parts = raw.split(",").map((part) => part.trim());
    if (parts.length !== 2 || !isNumberLiteral(parts[0]) || !isNumberLiteral(parts[1])) {
      return expectedDescription(entry);
    }
    const first = Number(parts[0]);
    const second = Number(parts[1]);
    return first >= 0 && first <= second ? undefined : expectedDescription(entry);
  }

  if (entry.valueType === "number-pair") {
    const parts = raw.split(",").map((part) => part.trim());
    return parts.length === 2 && isNumberLiteral(parts[0]) && isNumberLiteral(parts[1])
      ? undefined
      : expectedDescription(entry);
  }

  if (entry.valueType === "ip-address") {
    if (lower(raw) === "localhost") {
      return undefined;
    }
    const parts = raw.split(".").map((part) => part.trim());
    const valid = parts.length === 4 && parts.every((part) => (
      isNumberLiteral(part) && Number(part) >= 0 && Number(part) <= 255
    ));
    return valid ? undefined : expectedDescription(entry);
  }

  if (entry.valueType === "tif-file") {
    return !/\s/.test(raw) && !raw.startsWith("=") && lower(raw).endsWith(".tif")
      ? undefined
      : expectedDescription(entry);
  }

  if (entry.valueType === "single-equals-pair") {
    const parts = raw.split("=");
    return parts.length === 2 && parts[0].trim() !== "" && parts[1].trim() !== ""
      ? undefined
      : expectedDescription(entry);
  }

  if (entry.valueType === "comma-list-no-whitespace") {
    const parts = raw.split(",").map((part) => part.trim());
    const valid = parts.length > 0 && parts.every((part) => (
      part !== "" && !/\s/.test(part)
    ));
    return valid ? undefined : expectedDescription(entry);
  }

  if (entry.valueType === "no-whitespace-string") {
    return /\s/.test(raw) ? expectedDescription(entry) : undefined;
  }

  if (entry.valueType === "non-empty-string") {
    return raw === "" ? expectedDescription(entry) : undefined;
  }

  if (entry.valueType === "non-empty-no-whitespace-string") {
    return raw === "" || /\s/.test(raw) ? expectedDescription(entry) : undefined;
  }

  if (entry.valueType === "convex-polygon"
    || entry.valueType === "contact-filter-region"
    || entry.valueType === "seglist"
    || entry.valueType === "seglist-or-polygon"
    || entry.valueType === "waypoint-segment-list-or-polygon") {
    const result = validateGeometryValue(raw, entry.valueType);
    return result.status === "invalid"
      ? {
        expected: expectedDescription(entry),
        reason: geometryFailureDescription(result.reason)
      }
      : undefined;
  }

  return undefined;
}

module.exports = {
  diagnosticMessage,
  isGeometryValueType,
  validateSchemaValue
};
