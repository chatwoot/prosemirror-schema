// Block elements that handle their own spacing (no backslash needed adjacent to these)
const BLOCK_TYPES = new Set(['blockquote', 'code_block', 'bullet_list', 'ordered_list', 'heading', 'horizontal_rule', 'table']);

const MARKDOWN_PATTERNS = {
  // CommonMark list markers: "* ", "- ", "+ " or "1. ", "1) " (up to 9 digits)
  list: /^([*\-+]|\d{1,9}[.)])\s/,
  // Block-level markdown syntax that should not be preceded by backslash
  // Includes: blockquote (>), ATX headings (#), fenced code (``` or ~~~), thematic breaks (--, ---, ***, ___)
  blockStart: /^(>\s?|#{1,6}\s|```|~~~|[-*_]{2,}$)/,
  // Markdown table rows: lines starting with "|" (data rows, header rows, separator rows like |---|)
  tableRow: /^\|/,
};

/**
 * Checks if a paragraph node is empty (no visible content).
 * Empty = no trimmed text AND (no children OR only whitespace text nodes)
 * Edge cases handled:
 * - Truly empty: <p></p> → true
 * - Whitespace only: <p>   </p> → true
 * - Has image/mention: <p><image/></p> → false (not empty)
 * - Has text: <p>hello</p> → false (not empty)
 */
const isEmptyParagraph = node => {
  if (node.type.name !== 'paragraph') return false;
  if (!node.textContent.trim()) {
    // No visible text - verify it only contains text nodes (not images/mentions/etc.)
    for (let i = 0; i < node.childCount; i++) {
      if (!node.child(i).isText) return false;
    }
    return true;
  }
  return false;
};

/**
 * Checks if text starts with markdown syntax that should not be preceded by backslash.
 * Combines list syntax and block syntax detection for efficiency.
 * Detects:
 * - List markers: *, -, +, 1., 2), etc.
 * - Blockquotes: >
 * - Headings: #, ##, ###, etc.
 * - Code fences: ```, ~~~
 * - Thematic breaks: ---, ***, ___
 */
const startsWithMarkdownSyntax = text => {
  if (!text) return false;
  const trimmed = text.trim();
  return MARKDOWN_PATTERNS.list.test(trimmed) || MARKDOWN_PATTERNS.blockStart.test(trimmed) || MARKDOWN_PATTERNS.tableRow.test(trimmed);
};

// Find first non-empty sibling (skips multiple empty paragraphs)
// dir: 1 = next, -1 = prev | Returns node type name or null
const findNonEmptySibling = (parent, index, dir) => {
  for (let i = index + dir; dir > 0 ? i < parent.childCount : i >= 0; i += dir) {
    const child = parent.child(i);
    if (!isEmptyParagraph(child)) return child.type.name;
  }
  return null;
};

// True if nearest non-empty sibling (either direction) is a block element
// Edge case: multiple empty paragraphs before block → all skip backslash
const adjacentToBlock = (parent, index) =>
  BLOCK_TYPES.has(findNonEmptySibling(parent, index, 1)) ||
  BLOCK_TYPES.has(findNonEmptySibling(parent, index, -1));

// True if any sibling after `start` has content (text or children)
const hasContentAfter = (parent, start) => {
  for (let i = start; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (child.childCount || child.textContent.trim()) return true;
  }
  return false;
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

// Paragraph (Enter key)
// Fixes: Unwanted backslash appearing before blocks or in empty lines
// - Empty near block (list/blockquote/code) → "\n" (no backslash)
// - Empty between text → "\\\n" (preserves blank line)
// - Trailing empty / signature removed → "\n" (no literal "\")
// - Single empty doc → nothing | In table → normal render
export const paragraph = (state, node, parent, index) => {
  if (isEmptyParagraph(node) && !state.inTable) {
    if (parent.childCount === 1) return;
    if (adjacentToBlock(parent, index)) return state.write('\n');
    state.write(index > 0 && hasContentAfter(parent, index + 1) ? '\\\n' : '\n');
  } else {
    state.renderInline(node);
    state.closeBlock(node);
  }
};
export const image = (state, node) => {
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
  state.write(
    '![' +
      state.esc(node.attrs.alt || '') +
      '](' +
      src +
      (node.attrs.title ? ' ' + state.quote(node.attrs.title) : '') +
      ')'
  );
};

// Hard break (Shift+Enter)
// Fixes: Backslash only when followed by actual text, not on empty/trailing lines
// - Text after → "\\\n" (line break works correctly)
// - List syntax after ("* ", "1. ") → "\n" (user typing list)
// - Block syntax after (">", "#", etc.) → "\n" (user typing blockquote/heading)
// - Multiple hard_breaks without content → "\n" (no stray backslash)
// - Trailing / no content after → "\n" (no literal "\" showing)
export const hard_break = (state, node, parent, index) => {
  for (let i = index + 1; i < parent.childCount; i++) {
    const sibling = parent.child(i);
    if (sibling.type.name === 'hard_break') continue;
    if (sibling.isText) {
      if (!sibling.text.trim()) continue;
      return state.write(startsWithMarkdownSyntax(sibling.text) ? '\n' : '\\\n');
    }
    return state.write('\\\n');
  }
  state.write('\n');
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

// Serialize cell inline content to a markdown string (preserves marks)
function serializeCellContent(state, cell) {
  const parts = [];
  cell.forEach(block => {
    if (block.type.name === 'paragraph') {
      block.forEach(child => {
        let t = child.text || '';
        if (child.marks) {
          child.marks.forEach(mark => {
            const wrapper = MARK_WRAPPERS[mark.type.name];
            if (wrapper) {
              t = wrapper[0] + t + wrapper[1];
            } else if (mark.type.name === 'link' && mark.attrs.href) {
              t = '[' + t + '](' + mark.attrs.href + ')';
            }
          });
        }
        parts.push(t);
      });
    }
  });
  return parts.join('');
}

// Table node → markdown table with aligned columns
export const table = (state, node) => {
  const rows = [];
  node.forEach(row => rows.push(row));
  if (rows.length === 0) return;

  const colCount = rows[0].childCount;

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
          state.esc(mark.attrs.href).replace(/\(/g, '%28').replace(/\)/g, '%29') +
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
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href)) return false;
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
