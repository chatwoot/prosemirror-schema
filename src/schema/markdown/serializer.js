import { Fragment } from 'prosemirror-model';

// Blocks that manage their own spacing — empty lines next to them need no glue
const BLOCK_TYPES = new Set(['blockquote', 'code_block', 'bullet_list', 'ordered_list', 'heading', 'horizontal_rule', 'table']);

const MARKDOWN_PATTERNS = {
  // List markers: "* ", "- ", "+ ", "1. ", "1) " — bare marker at line end included
  list: /^([*\-+]|\d{1,9}[.)])(\s|$)/,
  // Block starters: blockquote, ATX heading (a bare "#" is a valid empty
  // heading and interrupts a paragraph), code fence, thematic break
  blockStart: /^(>\s?|#{1,6}(\s|$)|```|~~~|[-*_]{2,}$)/,
  tableRow: /^\|/,
  // Setext underline: a line of only "-" or "=" characters. cmark reads the
  // line above it as a heading (`a\n-` → <h2>a</h2>), so glue backslashes
  // must never sit on top of one unescaped.
  setextUnderline: /^(-+|=+)[ \t]*$/,
  // CommonMark also accepts an underline indented by 1-3 spaces. The escape
  // cannot be glued onto those (the `\` would land before the spaces), so
  // they detach with a blank line instead.
  indentedSetextUnderline: /^ {1,3}(-+|=+)[ \t]*$/,
  // A lone dash doubles as a bullet marker — it is a real list when inline
  // content (image/mention) follows it on the same line.
  soloDash: /^-[ \t]*$/,
};

const childrenOf = node => Array.from({ length: node.childCount }, (_, i) => node.child(i));

// An empty visual line: no visible text, only whitespace / hard_break children.
// Unifies Enter (empty paragraph) and Shift+Enter (break-only paragraph).
const isEmptyParagraph = node =>
  node.type.name === 'paragraph' &&
  !node.textContent.trim() &&
  childrenOf(node).every(child => child.isText || child.type.name === 'hard_break');

// Markdown syntax that must start its own line — never glue a `\` before it
const startsWithMarkdownSyntax = text => {
  const trimmed = (text || '').trim();
  return MARKDOWN_PATTERNS.list.test(trimmed) || MARKDOWN_PATTERNS.blockStart.test(trimmed) || MARKDOWN_PATTERNS.tableRow.test(trimmed);
};

// Nearest non-empty sibling in a direction (1 = next, -1 = prev); null if none
const findNonEmptySibling = (parent, index, dir) => {
  for (let i = index + dir; i >= 0 && i < parent.childCount; i += dir) {
    if (!isEmptyParagraph(parent.child(i))) return parent.child(i);
  }
  return null;
};

const adjacentToBlock = (parent, index) =>
  BLOCK_TYPES.has(findNonEmptySibling(parent, index, 1)?.type.name) ||
  BLOCK_TYPES.has(findNonEmptySibling(parent, index, -1)?.type.name);

// The visual line starting at `start`: its text (joining consecutive text
// siblings, since marks split a line into multiple text nodes) and whether
// that run closes the line — an atom sibling (image/mention) continues it.
// A whitespace-only marked node does not count as marked: the serializer
// expels enclosing whitespace, so it emits no mark syntax into the line.
const lineFrom = (parent, start) => {
  const rest = childrenOf(parent).slice(start);
  const stop = rest.findIndex(child => !child.isText);
  const run = stop < 0 ? rest : rest.slice(0, stop);
  return {
    text: run.map(child => child.text).join(''),
    marked: run.some(child => child.marks.length > 0 && child.text.trim()),
    closed: stop < 0 || rest[stop].type.name === 'hard_break',
  };
};

// A line cmark could read as a setext underline for the line above it, in a
// form the escape can neutralize (unmarked, unindented — the `\` must land
// right before the first dash). A lone dash counts only when it closes its
// line — followed by inline content it is a real bullet marker instead.
const isUnderline = ({ text, closed, marked }) =>
  !marked &&
  MARKDOWN_PATTERNS.setextUnderline.test(text) &&
  (closed || !MARKDOWN_PATTERNS.soloDash.test(text));

// Marked dashes serialize wrapped in mark syntax (**--**, `--`), which can
// never form an underline — plain glue is safe and keeps the formatting.
const isMarkedUnderline = ({ text, marked }) =>
  marked && MARKDOWN_PATTERNS.setextUnderline.test(text.trim());

// An unmarked underline the escape cannot reach: indented 1-3 spaces (still
// a valid underline to cmark) — only a blank line detaches it safely.
const isIndentedUnderline = ({ text, marked }) =>
  !marked && MARKDOWN_PATTERNS.indentedSetextUnderline.test(text);

// Trailing hard_break run of a paragraph (Shift+Enter presses at the end).
// Whitespace-only text inside the run belongs to it — the old keymap paired
// every break with a space. Returns the break count and the size it spans.
const trailingBreakRun = node => {
  const isBreak = child => child.type.name === 'hard_break';
  const reversed = childrenOf(node).reverse();
  const stop = reversed.findIndex(child => !isBreak(child) && !(child.isText && !child.text.trim()));
  const tail = stop < 0 ? reversed : reversed.slice(0, stop);
  const run = tail.slice(0, tail.map(isBreak).lastIndexOf(true) + 1);
  return {
    breaks: run.filter(isBreak).length,
    size: run.reduce((total, child) => total + child.nodeSize, 0),
  };
};

// First inline child is an atom (image/mention/tools). Never write glue before
// these: chatwoot's signature machinery compares serializations byte for byte,
// and the live editor's image isolation and the parser disagree about the
// preceding empty paragraph — both sides only match when neither writes glue.
const startsWithAtom = node => {
  const first = node.firstChild;
  return Boolean(first) && !first.isText && first.type.name !== 'hard_break';
};

/**
 * Pre-serialization normalization: reduce every empty visual line to ONE
 * canonical shape — the empty paragraph — so the serializer has a single
 * case to encode. Trailing hard_breaks of a top-level paragraph split off
 * into sibling empty paragraphs; a break-only paragraph becomes empty
 * paragraphs outright. Breaks with text after them stay untouched, as does
 * anything nested inside blockquotes, lists and tables.
 */
export const splitTrailingBreaks = doc => {
  const paragraphType = doc.type.schema.nodes.paragraph;
  const runFor = node => (node.type === paragraphType ? trailingBreakRun(node) : { breaks: 0 });
  if (!childrenOf(doc).some(node => runFor(node).breaks)) return doc;

  const blocks = childrenOf(doc).flatMap(node => {
    const { breaks, size } = runFor(node);
    if (!breaks) return node;
    const rest = node.cut(0, node.content.size - size);
    const empties = Array.from({ length: breaks }, () => paragraphType.create());
    return isEmptyParagraph(rest) ? empties : [rest, ...empties];
  });
  return doc.copy(Fragment.from(blocks));
};

/**
 * Markdown Serializer
*/
export const mention = (state, node) => {
  const userId = String(node.attrs.userId || '');
  const displayName = node.attrs.userFullName || '';
  const mentionType = node.attrs.mentionType || 'user';

  const uri = state.esc(
    `mention://${mentionType}/${userId}/${encodeURIComponent(displayName)}`
  );
  const escapedDisplayName = state.esc(`@${displayName}`);

  state.write(`[${escapedDisplayName}](${uri})`);
};

export const tools = (state, node) => {
  const uri = state.esc(`tool://${node.attrs.id}`);
  const escapedDisplayName = state.esc(`@${node.attrs.name}`);
  state.write(`[${escapedDisplayName}](${uri})`);
};

export const blockquote = (state, node) => {
  state.wrapBlock('> ', null, node, () => state.renderContent(node));
};
export const code_block = (state, node) => {
  state.write('```' + (node.attrs.params || '') + '\n');
  state.text(node.textContent, false);
  state.ensureNewLine();
  state.write('```');
  state.closeBlock(node);
};
export const heading = (state, node) => {
  state.write(state.repeat('#', node.attrs.level) + ' ');
  state.renderInline(node);
  state.closeBlock(node);
};
export const horizontal_rule = (state, node) => {
  state.write(node.attrs.markup || '---');
  state.closeBlock(node);
};
export const bullet_list = (state, node) => {
  state.renderList(node, '  ', () => (node.attrs.bullet || '*') + ' ');
};
export const ordered_list = (state, node) => {
  let start = node.attrs.order || 1;
  let maxW = String(start + node.childCount - 1).length;
  let space = state.repeat(' ', maxW + 2);
  state.renderList(node, space, i => {
    let nStr = String(start + i);
    return state.repeat(' ', maxW - nStr.length) + nStr + '. ';
  });
};
export const list_item = (state, node) => {
  state.renderContent(node);
};

// A non-empty paragraph serializes normally. An empty one (docs are
// normalized first, see splitTrailingBreaks) is an empty visual line,
// encoded as a `\` hard-break line glued to the next paragraph — the only
// shape CommonMark round-trips, since blank lines collapse. Glue is skipped
// where it would be misread: sole/leading/trailing position and atom-led
// paragraphs get nothing, blocks and block-markdown lines get plain "\n",
// and above a "--"/"==" underline the chain ends in "\\\n\\" so the escaped
// underline cannot form a setext heading.
export const paragraph = (state, node, parent, index) => {
  if (!isEmptyParagraph(node) || state.inTable) {
    state.renderInline(node);
    state.closeBlock(node);
    return;
  }
  if (parent.childCount === 1) return;
  if (adjacentToBlock(parent, index)) return state.write('\n');
  const next = findNonEmptySibling(parent, index, 1);
  if (index === 0 || !next || startsWithAtom(next)) return;
  const nextLine = lineFrom(next, 0);
  if (isMarkedUnderline(nextLine)) return state.write('\\\n');
  if (isUnderline(nextLine)) {
    return state.write(isEmptyParagraph(parent.child(index + 1)) ? '\\\n' : '\\\n\\');
  }
  // An underline the escape cannot reach (indented) must not be glued either —
  // it would read the glue line as a heading. Detach it with a plain newline.
  if (isIndentedUnderline(nextLine)) return state.write('\n');
  state.write(startsWithMarkdownSyntax(nextLine.text) ? '\n' : '\\\n');
};
export const image = (state, node) => {
  // blob: srcs are in-flight upload previews — autosaves must never capture them.
  if ((node.attrs.src || '').startsWith('blob:')) return;
  let src = state.esc(node.attrs.src);
  if (node.attrs.height) {
    const param = `cw_image_height=${node.attrs.height}`;
    if (src.includes('?')) {
      src = src.includes('cw_image_height=') ?
        src.replace(/cw_image_height=[^&]+/, param) : `${src}&${param}`;
    } else {
      src += `?${param}`;
    }
  }
  if (node.attrs.width) {
    const param = `cw_image_width=${node.attrs.width}`;
    if (src.includes('?')) {
      src = src.includes('cw_image_width=') ?
        src.replace(/cw_image_width=[^&]+/, param) : `${src}&${param}`;
    } else {
      src += `?${param}`;
    }
  }
  state.write(
    '![' +
      state.esc(node.attrs.alt || '') +
      '](' +
      src +
      (node.attrs.title ? ' ' + state.quote(node.attrs.title) : '') +
      ')'
  );
};

// Hard break (Shift+Enter). Writes "\\\n" only when real content follows on
// a later line; bare/trailing breaks write plain "\n" so no literal backslash
// ever shows. A line of block-markdown syntax ("* ", ">", "#"…) gets "\n"
// too, and the break directly above a "--"/"==" underline writes "\\\n\\" to
// escape it — unless whitespace text sits between them, which would detach
// the escape.
export const hard_break = (state, node, parent, index) => {
  const siblings = childrenOf(parent).slice(index + 1);
  const isFiller = child => child.type.name === 'hard_break' || (child.isText && !child.text.trim());
  const nextAt = siblings.findIndex(child => !isFiller(child));
  if (nextAt < 0) return state.write('\n');

  const next = siblings[nextAt];
  if (!next.isText) return state.write('\\\n');
  const line = lineFrom(parent, index + 1 + nextAt);
  const skippedWhitespace = siblings.slice(0, nextAt).some(child => child.isText);
  if (isMarkedUnderline(line)) return state.write('\\\n');
  if (isUnderline(line) && !skippedWhitespace) {
    return state.write(nextAt === 0 ? '\\\n\\' : '\\\n');
  }
  // An underline the escape cannot reach (indented, or detached from the
  // break by whitespace text) would still bind as a heading over this line —
  // a blank line is the only safe separator.
  if (isIndentedUnderline(line) || isUnderline(line)) return state.write('\n\n');
  state.write(startsWithMarkdownSyntax(line.text) ? '\n' : '\\\n');
};
export const text = (state, node) => {
  state.text(node.text, false);
};

// Simple mark wrappers for table cell serialization.
// Avoids calling mark open/close functions which expect specific parent/index args.
const MARK_WRAPPERS = {
  strong: ['**', '**'],
  em: ['*', '*'],
  code: ['`', '`'],
  strike: ['~~', '~~'],
  superscript: ['^', '^'],
  link: null, // handled specially
};

// CommonMark link destinations cannot contain whitespace or unbalanced
// parens; percent-encode/escape them so the stored markdown stays parseable
// for any href. Paren escaping happens after esc(), which would otherwise
// double-escape the backslashes. Shared by link.close and table cells.
function serializeLinkHref(state, href) {
  return state.esc(href.replace(/\s/g, encodeURIComponent)).replace(/[()]/g, '\\$&');
}

// Serialize cell inline content to a markdown string (preserves marks)
function serializeCellContent(state, cell) {
  const parts = [];
  cell.forEach(block => {
    if (block.type.name === 'paragraph') {
      block.forEach(child => {
        // Escape pipes so cell text can't add column boundaries on re-parse
        let t = (child.text || '').replace(/\|/g, '\\|');
        if (child.marks) {
          child.marks.forEach(mark => {
            const wrapper = MARK_WRAPPERS[mark.type.name];
            if (wrapper) {
              t = wrapper[0] + t + wrapper[1];
            } else if (mark.type.name === 'link' && mark.attrs.href) {
              t = '[' + t + '](' + serializeLinkHref(state, mark.attrs.href) + ')';
            }
          });
        }
        parts.push(t);
      });
    }
  });
  return parts.join('');
}

// Flatten first-row colwidths into the comment marker the parser re-applies on load.
// Each cell contributes `colspan` slots; cells with no width contribute 0.
// Returns an empty string when no cell has a saved width.
function serializeColwidths(headerRow) {
  const widths = [];
  headerRow.forEach(cell => {
    const { colwidth, colspan = 1 } = cell.attrs;
    for (let j = 0; j < colspan; j++) {
      widths.push(colwidth && colwidth[j] ? Math.round(colwidth[j]) : 0);
    }
  });
  return widths.some(w => w > 0) ? `<!--cw-colwidths:${widths.join(',')}-->\n` : '';
}

// Table node → markdown table with aligned columns
export const table = (state, node) => {
  const rows = [];
  node.forEach(row => rows.push(row));
  if (rows.length === 0) return;

  const colCount = rows[0].childCount;

  // Persist column widths set by the columnResizing plugin as an HTML comment.
  // Editor parser strips and re-applies it; CommonMark renderers ignore it.
  const colwidthMarker = serializeColwidths(rows[0]);
  if (colwidthMarker) state.write(colwidthMarker);

  // Calculate column widths for alignment
  const colWidths = new Array(colCount).fill(3);
  rows.forEach(row => {
    for (let c = 0; c < row.childCount; c++) {
      const text = serializeCellContent(state, row.child(c));
      colWidths[c] = Math.max(colWidths[c], text.length);
    }
  });

  const renderRow = row => {
    const cells = [];
    for (let c = 0; c < row.childCount; c++) {
      const text = serializeCellContent(state, row.child(c));
      cells.push(' ' + text.padEnd(colWidths[c]) + ' ');
    }
    state.write('|' + cells.join('|') + '|\n');
  };

  // First row
  renderRow(rows[0]);

  // Separator after header
  const isHeader = rows[0].childCount > 0 &&
    rows[0].child(0).type.name === 'table_header';
  if (isHeader) {
    const sep = colWidths.map(w => ' ' + '-'.repeat(w) + ' ');
    state.write('|' + sep.join('|') + '|\n');
  }

  // Remaining rows
  for (let i = 1; i < rows.length; i++) {
    renderRow(rows[i]);
  }

  state.closeBlock(node);
};

// These are handled by the table serializer above, but prosemirror-markdown
// requires every node type to have an entry
export const table_row = () => {};
export const table_cell = () => {};
export const table_header = () => {};

export const em = {
  open: '*',
  close: '*',
  mixable: true,
  expelEnclosingWhitespace: true,
};
export const superscript = {
  open: '^',
  close: '^',
  mixable: false,
  escape: false,
  expelEnclosingWhitespace: false,
};
export const strike = {
  open: '~~',
  close: '~~',
  mixable: true,
  expelEnclosingWhitespace: true,
};
export const strong = {
  open: '**',
  close: '**',
  mixable: true,
  expelEnclosingWhitespace: true,
};
export const link = {
  open(_state, mark, parent, index) {
    return isPlainURL(mark, parent, index, 1) ? '<' : '[';
  },
  close(state, mark, parent, index) {
    return isPlainURL(mark, parent, index, -1)
      ? '>'
      : '](' +
          serializeLinkHref(state, mark.attrs.href) +
          (mark.attrs.title ? ' ' + state.quote(mark.attrs.title) : '') +
          ')';
  },
  escape: false,
};
export const code = {
  open(_state, _mark, parent, index) {
    return backticksFor(parent.child(index), -1);
  },
  close(_state, _mark, parent, index) {
    return backticksFor(parent.child(index - 1), 1);
  },
  escape: false,
};

function backticksFor(node, side) {
  let ticks = /`+/g,
    m,
    len = 0;
  if (node.isText)
    while ((m = ticks.exec(node.text))) len = Math.max(len, m[0].length);
  let result = len > 0 && side > 0 ? ' `' : '`';
  for (let i = 0; i < len; i++) result += '`';
  if (len > 0 && side < 0) result += ' ';
  return result;
}

function isPlainURL(link, parent, index, side) {
  // `<url>` autolinks cannot contain whitespace; fall back to the
  // []() form, which percent-encodes it
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href) || /\s/.test(link.attrs.href)) return false;
  let content = parent.child(index + (side < 0 ? -1 : 0));
  if (
    !content.isText ||
    content.text != link.attrs.href ||
    content.marks[content.marks.length - 1] != link
  )
    return false;
  if (index == (side < 0 ? 1 : parent.childCount - 1)) return true;
  let next = parent.child(index + (side < 0 ? -2 : 1));
  return !link.isInSet(next.marks);
}
