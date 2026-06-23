function isNumberLiteral(value) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim());
}

const GENERATED_POLYGON_PREFIXES = [
  "radial:",
  "radial::",
  "ellipse:",
  "ellipse::",
  "wedge:",
  "piewedge:",
  "rangewedge:",
  "pylon:",
  "oval:"
];

const GENERATED_SEGLIST_PREFIXES = [
  "zigzag:",
  "lawnmower:"
];

function unsupportedGeometrySyntax(value, prefixes) {
  const raw = value.trim();
  const compact = raw.replace(/\s/g, "").toLowerCase();
  return prefixes.some((prefix) => compact.startsWith(prefix))
    || /\bformat\s*=/.test(compact)
    || /(?:^|,)\s*(?:label|source|active|msg|vertex_|edge_|point_|label_)/i.test(raw);
}

function parsePointToken(token) {
  const parts = token.split(",").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) {
    return undefined;
  }
  if (!isNumberLiteral(parts[0]) || !isNumberLiteral(parts[1])) {
    return undefined;
  }
  if (parts[2] !== undefined && parts[2] !== "" && !isNumberLiteral(parts[2])) {
    return undefined;
  }
  return {
    x: Number(parts[0]),
    y: Number(parts[1])
  };
}

function parseColonPointList(pointsText) {
  if (pointsText.trim() === "") {
    return undefined;
  }

  const points = [];
  const tokens = pointsText.split(":");
  for (const item of tokens) {
    const point = parsePointToken(item.trim());
    if (!point) {
      return undefined;
    }
    points.push(point);
  }
  return points;
}

function parseSimpleGeometryPoints(value, options = {}) {
  const raw = value.trim();
  if (raw === "") {
    return { status: "invalid", reason: "empty" };
  }

  if (unsupportedGeometrySyntax(raw, options.generatedPrefixes || [])) {
    return { status: "skipped", reason: "unsupported-source-backed-syntax" };
  }

  if (/^pts\s*=/i.test(raw)) {
    const standard = raw.match(/^pts\s*=\s*\{([^}]*)\}\s*(.*)$/i);
    if (!standard) {
      return { status: "invalid", reason: "malformed-standard-points" };
    }
    if (standard[2].trim() !== "") {
      return { status: "skipped", reason: "unsupported-source-backed-syntax" };
    }
    const points = parseColonPointList(standard[1]);
    return points
      ? { status: "valid", points, format: "standard" }
      : { status: "invalid", reason: "malformed-point-list" };
  }

  if (raw.includes("=") || raw.includes("{") || raw.includes("}")) {
    return { status: "skipped", reason: "unsupported-field-syntax" };
  }

  const points = parseColonPointList(raw);
  return points
    ? { status: "valid", points, format: "abbreviated" }
    : { status: "invalid", reason: "malformed-abbreviated-points" };
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (current.x * next.y) - (next.x * current.y);
  }
  return area / 2;
}

const GEOMETRY_EPSILON = 1e-9;

function crossProduct(a, b, c) {
  return ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x));
}

function pointOnSegment(point, a, b) {
  return Math.abs(crossProduct(a, b, point)) <= GEOMETRY_EPSILON
    && point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON
    && point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON
    && point.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON
    && point.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON;
}

function orientation(a, b, c) {
  const cross = crossProduct(a, b, c);
  if (Math.abs(cross) <= GEOMETRY_EPSILON) {
    return 0;
  }
  return Math.sign(cross);
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4) {
    return true;
  }

  return (o1 === 0 && pointOnSegment(c, a, b))
    || (o2 === 0 && pointOnSegment(d, a, b))
    || (o3 === 0 && pointOnSegment(a, c, d))
    || (o4 === 0 && pointOnSegment(b, c, d));
}

function adjacentPolygonEdges(firstIndex, secondIndex, edgeCount) {
  return Math.abs(firstIndex - secondIndex) === 1
    || (firstIndex === 0 && secondIndex === edgeCount - 1);
}

function hasSelfIntersection(points) {
  for (let first = 0; first < points.length; first++) {
    const firstStart = points[first];
    const firstEnd = points[(first + 1) % points.length];

    for (let second = first + 1; second < points.length; second++) {
      if (adjacentPolygonEdges(first, second, points.length)) {
        continue;
      }

      const secondStart = points[second];
      const secondEnd = points[(second + 1) % points.length];
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        return true;
      }
    }
  }
  return false;
}

function isConvexPointList(points) {
  if (points.length < 3 || polygonArea(points) === 0) {
    return false;
  }

  let sign = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    const cross = ((b.x - a.x) * (c.y - b.y)) - ((b.y - a.y) * (c.x - b.x));
    if (cross === 0) {
      continue;
    }
    const currentSign = Math.sign(cross);
    if (sign !== 0 && currentSign !== sign) {
      return false;
    }
    sign = currentSign;
  }
  return sign !== 0;
}

function validateGeometryValue(value, valueType) {
  if (valueType === "convex-polygon" || valueType === "contact-filter-region") {
    const parsed = parseSimpleGeometryPoints(value, {
      generatedPrefixes: GENERATED_POLYGON_PREFIXES
    });
    if (parsed.status !== "valid") {
      return parsed;
    }
    if (parsed.points.length < 3) {
      return { status: "invalid", reason: "too-few-polygon-points" };
    }
    if (hasSelfIntersection(parsed.points)) {
      return { status: "invalid", reason: "self-intersecting-polygon" };
    }
    if (!isConvexPointList(parsed.points)) {
      return { status: "invalid", reason: "non-convex-polygon" };
    }
    return parsed;
  }

  if (valueType === "seglist") {
    const parsed = parseSimpleGeometryPoints(value, {
      generatedPrefixes: GENERATED_SEGLIST_PREFIXES
    });
    if (parsed.status !== "valid") {
      return parsed;
    }
    if (parsed.points.length < 1) {
      return { status: "invalid", reason: "empty-seglist" };
    }
    return parsed;
  }

  if (valueType === "seglist-or-polygon" || valueType === "waypoint-segment-list-or-polygon") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "empty" || lowered === "start") {
      return { status: "valid", format: lowered };
    }

    if (unsupportedGeometrySyntax(value, [
      ...GENERATED_SEGLIST_PREFIXES,
      ...GENERATED_POLYGON_PREFIXES
    ])) {
      return { status: "skipped", reason: "unsupported-source-backed-syntax" };
    }

    const seglist = parseSimpleGeometryPoints(value, {
      generatedPrefixes: GENERATED_SEGLIST_PREFIXES
    });
    if (seglist.status === "valid") {
      return seglist.points.length > 0
        ? seglist
        : { status: "invalid", reason: "empty-seglist" };
    }
    if (seglist.status === "skipped") {
      return seglist;
    }

    const polygon = parseSimpleGeometryPoints(value, {
      generatedPrefixes: GENERATED_POLYGON_PREFIXES
    });
    return polygon.status === "valid" && polygon.points.length > 0
      ? polygon
      : { status: "invalid", reason: polygon.reason || seglist.reason };
  }

  return { status: "skipped", reason: "unsupported-geometry-value-type" };
}

module.exports = {
  isNumberLiteral,
  isConvexPointList,
  parseSimpleGeometryPoints,
  validateGeometryValue
};
