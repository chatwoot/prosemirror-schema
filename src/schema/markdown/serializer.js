// Checks if any sibling after `start` has text content
// Used by: paragraph serializer to decide if backslash is needed
// Edge case: returns false for trailing empty paragraphs (no backslash needed)
const hasTextAfter = (parent, start) => {
  const count = parent.childCount;
  for (let i = start; i < count; i++) {
    const child = parent.child(i);
    if (child.childCount > 0 || child.textContent.trim()) return true;
  }
  return false;
};

// Checks if previous sibling paragraph ends with hard_break
// Used by: paragraph serializer to avoid double backslash after Shift+Enter + Enter
const prevEndsWithHardBreak = (parent, index) =>
  index > 0 && parent.child(index - 1).lastChild?.type.name === 'hard_break';

// Checks if text starts with list syntax (*, -, +, 1., 1), etc.)
// Used by: hard_break serializer to skip backslash when user types list after Shift+Enter
const isListSyntax = text =>
  text && (/^[*\-+]\s/.test(text.trim()) || /^\d{1,9}[.)]\s/.test(text.trim()));

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

// Paragraph serializer (handles Enter key)
// - Empty paragraph + text after + prev not ending with hard_break → outputs "\"
// - Empty paragraph + no text after → outputs newline only (no backslash)
// - Empty paragraph after hard_break → outputs newline only (prevents literal "\" showing)
// - First empty paragraph (index 0) → outputs newline only (cursor placeholder)
export const paragraph = (state, node, parent, index) => {
  const isEmpty = !node.textContent.trim() && !node.childCount && !state.inTable;
  if (isEmpty) {
    // Single empty paragraph (entire document is empty) - output nothing
    if (parent.childCount === 1) return;
    const br = index > 0 && hasTextAfter(parent, index + 1) && !prevEndsWithHardBreak(parent, index);
    state.write(br ? '\\\n' : '\n');
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

// Hard break serializer (handles Shift+Enter)
// - Text content after → outputs "\" (markdown line break)
// - List-like text after (*, -, 1., etc.) → outputs newline only (user typed list syntax)
// - No text after (trailing) → outputs newline only (prevents literal "\" showing)
export const hard_break = (state, node, parent, index) => {
  const count = parent.childCount;
  for (let i = index + 1; i < count; i++) {
    const sibling = parent.child(i);
    const name = sibling.type.name;
    if (name === 'hard_break' || (name === 'text' && !sibling.text.trim())) continue;
    if (name === 'text' && isListSyntax(sibling.text)) return state.write('\n');
    if (name === 'text' ? sibling.text.trim() : name !== 'hard_break') return state.write('\\\n');
  }
  state.write('\n');
};
export const text = (state, node) => {
  state.text(node.text, false);
};

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
          state.esc(mark.attrs.href) +
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
