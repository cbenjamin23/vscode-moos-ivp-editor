function parameterLookupName(name) {
  return String(name || "").replace(/\[[^\]]*\]$/, "");
}

function inlineCommentIndex(line) {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < line.length - 1; index++) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (!inString && char === "/" && line[index + 1] === "/") {
      return index;
    }
  }

  return -1;
}

function stripInlineComment(line) {
  const index = inlineCommentIndex(line);
  return index === -1 ? line : line.slice(0, index);
}

function splitInlineComment(line) {
  const index = inlineCommentIndex(line);
  if (index === -1) {
    return { code: line, comment: "" };
  }

  return {
    code: line.slice(0, index),
    comment: line.slice(index)
  };
}

function braceDelta(text) {
  let delta = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      delta++;
    } else if (char === "}") {
      delta--;
    }
  }

  return delta;
}

function hasOpeningBrace(text) {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (!inString && char === "{") {
      return true;
    }
  }

  return false;
}

function blockHeaderPattern(language) {
  return language === "moos"
    ? /^\s*ProcessConfig\s*=\s*[A-Za-z_][A-Za-z0-9_]*/i
    : /^\s*Behavior\s*=\s*[A-Za-z_][A-Za-z0-9_]*/;
}

function blockHeaderMatcher(language) {
  return language === "moos"
    ? /^(\s*)(ProcessConfig)(\s*)=(\s*)([A-Za-z_][A-Za-z0-9_]*)(.*)$/i
    : /^(\s*)(Behavior)(\s*)=(\s*)([A-Za-z_][A-Za-z0-9_]*)(.*)$/;
}

function assignmentMatcher() {
  return /^(\s*)([A-Za-z_][A-Za-z0-9_+:-]*(?:\[[^\]]+\])?)(\s*)=(\s*)(.*)$/;
}

function findCurrentOwner(document, position, language) {
  const headerPattern = language === "moos"
    ? /^\s*ProcessConfig\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/
    : /^\s*Behavior\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/;
  let owner;
  let pendingOwner;

  for (let lineNumber = 0; lineNumber <= position.line; lineNumber++) {
    const line = document.lineAt(lineNumber).text;
    const header = line.match(headerPattern);
    if (header) {
      pendingOwner = header[1];
      if (line.includes("{")) owner = pendingOwner;
    } else if (pendingOwner && line.includes("{")) {
      owner = pendingOwner;
      pendingOwner = undefined;
    }

    if (/^\s*}\s*(?:\/\/.*)?$/.test(line)) {
      owner = undefined;
      pendingOwner = undefined;
    }
  }

  return owner;
}

function assignmentKeyAtPosition(document, position, range) {
  const line = stripInlineComment(document.lineAt(position.line).text);
  const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_+:-]*(?:\[[^\]]+\])?)(\s*=\s*)/);
  if (!match) {
    return undefined;
  }

  const start = match[1].length;
  const end = start + match[2].length;
  const baseEnd = start + parameterLookupName(match[2]).length;
  if (range.start.character === start && (range.end.character === end || range.end.character === baseEnd)) {
    return match[2];
  }

  return undefined;
}

function blockOwnerAtPosition(document, position, range, language) {
  const line = stripInlineComment(document.lineAt(position.line).text);
  const match = language === "moos"
    ? line.match(/^(\s*)(ProcessConfig)(\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)/)
    : line.match(/^(\s*)(Behavior)(\s*=\s*)([A-Za-z_][A-Za-z0-9_]*)/);
  if (!match) {
    return undefined;
  }

  const start = match[1].length + match[2].length + match[3].length;
  const end = start + match[4].length;
  return range.start.character === start && range.end.character === end
    ? match[4]
    : undefined;
}

function createBlockState() {
  return {
    owner: undefined,
    kind: undefined,
    pendingOwner: undefined,
    pendingKind: undefined
  };
}

function applyBlockState(text, state) {
  if (state.pendingOwner && text.includes("{")) {
    state.owner = state.pendingOwner;
    state.kind = state.pendingKind;
    state.pendingOwner = undefined;
    state.pendingKind = undefined;
  }

  if (/^\s*}\s*$/.test(text) && state.owner) {
    state.owner = undefined;
    state.kind = undefined;
  }
}

module.exports = {
  parameterLookupName,
  inlineCommentIndex,
  stripInlineComment,
  splitInlineComment,
  braceDelta,
  hasOpeningBrace,
  blockHeaderPattern,
  blockHeaderMatcher,
  assignmentMatcher,
  findCurrentOwner,
  assignmentKeyAtPosition,
  blockOwnerAtPosition,
  createBlockState,
  applyBlockState
};
