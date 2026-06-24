const {
  stripInlineComment,
  splitInlineComment,
  braceDelta,
  blockHeaderMatcher,
  assignmentMatcher
} = require("./scanner");

function formatIndent(level, options) {
  return " ".repeat(Math.max(0, level) * options.indentSize);
}

function lineEndingFor(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function documentText(document) {
  if (typeof document.getText === "function") {
    return document.getText();
  }

  const lines = [];
  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    lines.push(document.lineAt(lineNumber).text);
  }
  return lines.join("\n");
}

function createFormattingIssue(lineNumber, message, code) {
  return {
    lineNumber,
    message,
    code
  };
}

function isPreprocessorDirectiveLine(line) {
  return /^#(?:include|ifdef|elseifdef|endif|else|define|ifndef)\b/.test(line.trim());
}

function isBlockHeaderLine(line, language) {
  return blockHeaderMatcher(language).test(stripInlineComment(line).trimEnd());
}

function appendComment(code, comment) {
  if (!comment) {
    return code;
  }
  if (code.trim() === "") {
    return `${code}${comment.trimStart()}`;
  }
  return `${code.replace(/[ \t]+$/, "")} ${comment.trimStart()}`;
}

function formatAssignmentLine(trimmedCode, comment, indent, lineNumber, issues) {
  const assignment = trimmedCode.match(assignmentMatcher());
  if (!assignment) {
    return undefined;
  }

  const value = assignment[5].trim();
  const formatted = value === ""
    ? `${indent}${assignment[2]} =`
    : `${indent}${assignment[2]} = ${value}`;
  if (assignment[3].length === 0 || assignment[4].length === 0) {
    issues.push(createFormattingIssue(
      lineNumber,
      "Expected spaces around '='.",
      "assignment-spacing"
    ));
  }
  return appendComment(formatted, comment);
}

function formatBehaviorDirectiveLine(trimmedCode, comment, indent, lineNumber, issues) {
  const directive = trimmedCode.match(/^(initialize|set)(\s+)([A-Za-z_][A-Za-z0-9_]*)(\s*)=(\s*)(.*)$/);
  if (!directive) {
    return undefined;
  }

  const value = directive[6].trim();
  const formatted = value === ""
    ? `${indent}${directive[1]} ${directive[3]} =`
    : `${indent}${directive[1]} ${directive[3]} = ${value}`;
  if (directive[2] !== " " || directive[4].length === 0 || directive[5].length === 0) {
    issues.push(createFormattingIssue(
      lineNumber,
      "Expected spaces around behavior directive assignment.",
      "behavior-directive-spacing"
    ));
  }
  return appendComment(formatted, comment);
}

function formatBlockHeaderLine(trimmedCode, comment, indent, lineNumber, language, issues) {
  const header = trimmedCode.match(blockHeaderMatcher(language));
  if (!header) {
    return undefined;
  }

  const rest = header[6].trim();
  const formattedHeader = `${indent}${header[2]} = ${header[5]}`;
  if (header[3].length === 0 || header[4].length === 0) {
    issues.push(createFormattingIssue(
      lineNumber,
      "Expected spaces around block header '='.",
      "block-header-spacing"
    ));
  }

  if (rest === "{") {
    issues.push(createFormattingIssue(
      lineNumber,
      "Expected opening brace on its own line.",
      "opening-brace-placement"
    ));
    return [appendComment(formattedHeader, ""), appendComment(`${indent}{`, comment)];
  }

  if (rest === "") {
    return [appendComment(formattedHeader, comment)];
  }

  return [appendComment(`${formattedHeader} ${rest}`, comment)];
}

function nextNonBlankLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index++) {
    if (lines[index].trim() !== "") {
      return index;
    }
  }
  return -1;
}

function normalizeBlankLinesBetweenBlocks(lines, language, issues) {
  const normalized = [];
  for (let index = 0; index < lines.length; index++) {
    normalized.push(lines[index]);
    if (lines[index].trim() !== "}") {
      continue;
    }

    const nextIndex = nextNonBlankLine(lines, index + 1);
    if (nextIndex === -1 || !isBlockHeaderLine(lines[nextIndex], language)) {
      continue;
    }

    const blankCount = nextIndex - index - 1;
    if (blankCount !== 1) {
      issues.push(createFormattingIssue(
        index,
        "Expected exactly one blank line between blocks.",
        "blank-line-between-blocks"
      ));
    }
    normalized.push("");
    index = nextIndex - 1;
  }
  return normalized;
}

function assignmentAlignmentEntry(line) {
  const parts = splitInlineComment(line);
  const assignment = parts.code.match(assignmentMatcher());
  if (!assignment) {
    return undefined;
  }

  return {
    indent: assignment[1],
    key: assignment[2],
    value: assignment[5].trim(),
    comment: parts.comment
  };
}

function alignAssignmentGroup(lines, entries) {
  if (entries.length < 2) {
    return;
  }

  const maxKeyLength = entries.reduce((max, entry) => (
    Math.max(max, entry.assignment.key.length)
  ), 0);

  entries.forEach((entry) => {
    const assignment = entry.assignment;
    const padding = " ".repeat(maxKeyLength - assignment.key.length + 1);
    const code = assignment.value === ""
      ? `${assignment.indent}${assignment.key}${padding}=`
      : `${assignment.indent}${assignment.key}${padding}= ${assignment.value}`;
    lines[entry.index] = appendComment(code, assignment.comment);
  });
}

function alignAssignmentsInBlocks(lines) {
  const aligned = [...lines];
  const stack = [];

  for (let index = 0; index < aligned.length; index++) {
    const code = stripInlineComment(aligned[index]).trim();

    if (/^\}\s*$/.test(code)) {
      const block = stack.pop();
      if (block) {
        alignAssignmentGroup(aligned, block.entries);
      }
      continue;
    }

    if (/^\{\s*$/.test(code)) {
      stack.push({ entries: [] });
      continue;
    }

    if (stack.length > 0) {
      const assignment = assignmentAlignmentEntry(aligned[index]);
      if (assignment) {
        stack[stack.length - 1].entries.push({ index, assignment });
      }
    }
  }

  while (stack.length > 0) {
    alignAssignmentGroup(aligned, stack.pop().entries);
  }

  return aligned;
}

function antlerRunEntry(line) {
  const parts = splitInlineComment(line);
  const match = parts.code.match(/^(\s*)Run\s*=\s*([^\s@]+)(?:\s*@\s*(.*?))?\s*$/);
  if (!match) {
    return undefined;
  }

  return {
    indent: match[1],
    app: match[2],
    options: (match[3] || "").trim(),
    comment: parts.comment
  };
}

const ANTLER_RUN_OPTION_PATTERN = /\b(NewConsole|InhibitMOOSParams|Path|ExtraProcessParams|XConfig|Win32Config|AntlerID)\s*=\s*/g;

function formatAntlerRunOptions(options) {
  return options
    .replace(ANTLER_RUN_OPTION_PATTERN, "$1 = ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function antlerBlockRanges(lines) {
  const ranges = [];
  let pendingStart = -1;
  let inAntler = false;
  let start = -1;
  let depth = 0;

  for (let index = 0; index < lines.length; index++) {
    const code = stripInlineComment(lines[index]).trim();

    if (!inAntler && /^ProcessConfig\s*=\s*(?:ANTLER|pAntler)$/i.test(code)) {
      pendingStart = index;
      continue;
    }

    if (!inAntler && pendingStart !== -1 && /^\{\s*$/.test(code)) {
      inAntler = true;
      start = pendingStart;
      pendingStart = -1;
      depth = 1;
      continue;
    }

    if (!inAntler) {
      if (code !== "") {
        pendingStart = -1;
      }
      continue;
    }

    if (/^\{\s*$/.test(code)) {
      depth++;
    } else if (/^\}\s*$/.test(code)) {
      depth--;
      if (depth === 0) {
        ranges.push({ start, end: index });
        inAntler = false;
        start = -1;
      }
    }
  }

  return ranges;
}

function alignAntlerRunLines(lines) {
  const aligned = [...lines];
  antlerBlockRanges(aligned).forEach((range) => {
    const entries = [];
    for (let index = range.start + 1; index < range.end; index++) {
      const entry = antlerRunEntry(aligned[index]);
      if (entry) {
        entries.push({ index, entry });
      }
    }

    if (!entries.length) {
      return;
    }

    const maxPrefixLength = entries.reduce((max, item) => (
      Math.max(max, `${item.entry.indent}Run = ${item.entry.app}`.length)
    ), 0);

    entries.forEach((item) => {
      const entry = item.entry;
      const prefix = `${entry.indent}Run = ${entry.app}`;
      const options = formatAntlerRunOptions(entry.options);
      const code = options
        ? `${prefix}${" ".repeat(maxPrefixLength - prefix.length + 1)}@ ${options}`
        : prefix;
      aligned[item.index] = appendComment(code, entry.comment);
    });
  });

  return aligned;
}

function defaultFormattingOptions(options = {}) {
  const indentSize = Number(options.indentSize);
  return {
    indentSize: Number.isInteger(indentSize) && indentSize > 0 ? indentSize : 2
  };
}

function formatMoosIvpText(text, language, options = {}) {
  const formatterOptions = defaultFormattingOptions(options);
  const lineEnding = lineEndingFor(text);
  const hasFinalNewline = /\r?\n$/.test(text);
  const rawLines = text.split(/\r?\n/);
  if (hasFinalNewline) {
    rawLines.pop();
  }

  const output = [];
  const issues = [];
  let indentLevel = 0;

  rawLines.forEach((rawLine, lineNumber) => {
    const trailingTrimmed = rawLine.replace(/[ \t]+$/, "");
    if (trailingTrimmed !== rawLine) {
      issues.push(createFormattingIssue(
        lineNumber,
        "Expected no trailing whitespace.",
        "trailing-whitespace"
      ));
    }

    if (rawLine.trim() === "") {
      if (rawLine !== "") {
        issues.push(createFormattingIssue(
          lineNumber,
          "Expected whitespace-only line to be empty.",
          "empty-line-whitespace"
        ));
      }
      output.push("");
      return;
    }

    const leading = trailingTrimmed.match(/^[ \t]*/)[0];
    if (leading.includes(" ") && leading.includes("\t")) {
      issues.push(createFormattingIssue(
        lineNumber,
        "Expected indentation to use spaces without mixed tabs.",
        "mixed-indentation"
      ));
    }

    const parts = splitInlineComment(trailingTrimmed);
    const trimmedCode = parts.code.trim();
    const isPreprocessorDirective = isPreprocessorDirectiveLine(trimmedCode);
    const isClosingBrace = trimmedCode.startsWith("}");
    const lineIndentLevel = isPreprocessorDirective
      ? 0
      : (isClosingBrace ? Math.max(0, indentLevel - 1) : indentLevel);
    const indent = formatIndent(lineIndentLevel, formatterOptions);

    if (leading !== indent) {
      issues.push(createFormattingIssue(
        lineNumber,
        "Expected consistent indentation.",
        "indentation"
      ));
    }

    const headerLines = formatBlockHeaderLine(trimmedCode, parts.comment, indent, lineNumber, language, issues);
    if (isPreprocessorDirective) {
      output.push(appendComment(trimmedCode, parts.comment));
    } else if (headerLines) {
      output.push(...headerLines);
    } else if (/^\{\s*$/.test(trimmedCode)) {
      output.push(appendComment(`${indent}{`, parts.comment));
    } else if (/^\}\s*$/.test(trimmedCode)) {
      output.push(appendComment(`${indent}}`, parts.comment));
    } else {
      const directiveLine = language === "ivp-behavior"
        ? formatBehaviorDirectiveLine(trimmedCode, parts.comment, indent, lineNumber, issues)
        : undefined;
      const assignmentLine = directiveLine
        || formatAssignmentLine(trimmedCode, parts.comment, indent, lineNumber, issues);
      output.push(assignmentLine || appendComment(`${indent}${trimmedCode}`, parts.comment));
    }

    const delta = isPreprocessorDirective ? 0 : braceDelta(trimmedCode);
    if (delta < 0 && indentLevel + delta < 0) {
      issues.push(createFormattingIssue(
        lineNumber,
        "Suspicious unmatched closing brace.",
        "unmatched-closing-brace"
      ));
    }
    indentLevel = Math.max(0, indentLevel + delta);
  });

  if (indentLevel > 0 && rawLines.length > 0) {
    issues.push(createFormattingIssue(
      rawLines.length - 1,
      "Suspicious unmatched opening brace.",
      "unmatched-opening-brace"
    ));
  }

  const normalizedOutput = normalizeBlankLinesBetweenBlocks(output, language, issues);
  const alignedOutput = language === "moos"
    ? alignAntlerRunLines(alignAssignmentsInBlocks(normalizedOutput))
    : alignAssignmentsInBlocks(normalizedOutput);
  const formatted = alignedOutput.join(lineEnding) + (hasFinalNewline ? lineEnding : "");
  return {
    text: formatted,
    issues
  };
}

function formatDocument(document, language, options = {}) {
  return formatMoosIvpText(documentText(document), language, options);
}

module.exports = {
  defaultFormattingOptions,
  documentText,
  formatDocument,
  formatMoosIvpText
};
