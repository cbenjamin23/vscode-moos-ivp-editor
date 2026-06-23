const {
  stripInlineComment,
  braceDelta,
  hasOpeningBrace,
  blockHeaderPattern
} = require("./scanner");

function collectBlockFoldingRangeRecords(document, language) {
  const ranges = [];
  const headerPattern = blockHeaderPattern(language);
  let current;

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const text = stripInlineComment(document.lineAt(lineNumber).text);
    if (headerPattern.test(text) && (!current || !current.opened)) {
      current = {
        startLine: lineNumber,
        depth: 0,
        opened: false
      };
    }

    if (!current) {
      continue;
    }

    const delta = braceDelta(text);
    if (!current.opened) {
      if (!hasOpeningBrace(text)) {
        continue;
      }
      current.opened = true;
    }

    current.depth += delta;
    if (current.depth <= 0) {
      if (lineNumber > current.startLine) {
        ranges.push({
          startLine: current.startLine,
          endLine: lineNumber
        });
      }
      current = undefined;
    }
  }

  return ranges;
}

function collectBlockFoldingRanges(vscode, document, language) {
  return collectBlockFoldingRangeRecords(document, language)
    .map((range) => new vscode.FoldingRange(range.startLine, range.endLine));
}

function createFoldingRangeProvider(vscode, language) {
  return {
    provideFoldingRanges(document) {
      return collectBlockFoldingRanges(vscode, document, language);
    }
  };
}

module.exports = {
  collectBlockFoldingRangeRecords,
  collectBlockFoldingRanges,
  createFoldingRangeProvider
};
