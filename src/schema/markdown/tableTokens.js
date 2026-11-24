// Preprocess markdown-it table tokens for ProseMirror compatibility:
// 1. Strip thead/tbody wrappers — ProseMirror tables have no equivalent nodes.
// 2. Wrap cell (th/td) inline content in paragraph tokens — ProseMirror table cells
//    require block content (content: 'block+'), but markdown-it emits raw inline tokens.
// 3. Pull `<!--cw-colwidths:...-->` markers out of the source and re-apply the
//    widths to each table's first-row cells (so columnResizing widths survive
//    a markdown round-trip).
// 4. With `cellLists`, turn the inline HTML lists the serializer writes in a cell
//    (`<ul><li>…</li></ul>`) back into list tokens.
const COLWIDTHS_MARKER = /^[ \t]*<!--cw-colwidths:([\d,]+)-->[ \t]*\r?$/;
const FENCE = /^[ \t]*(```|~~~)/;
// Leading blockquote markers (`> `, `> > `, …). Stripped before marker/table
// detection so a table nested in a blockquote is counted and sized like any other.
const BLOCKQUOTE_PREFIX = /^[ \t]*(?:>[ \t]?)+/;
// A markdown table is detected by its delimiter row (`| --- | --- |`). Requiring a
// pipe keeps thematic breaks (`---`) from being miscounted as tables.
const isTableDelimiter = line =>
  line.includes('|') && line.includes('-') && /^[\s|:-]+$/.test(line);
const paragraphToken = nesting => ({
  type: nesting > 0 ? 'paragraph_open' : 'paragraph_close',
  tag: 'p',
  nesting,
  attrs: null,
  content: '',
});

// Strip every `<!--cw-colwidths:...-->` line and map its widths to the table that
// follows it, keyed by table position so width-less tables don't shift the mapping.
const extractColwidths = src => {
  const widthsByTable = {};
  let tableCount = 0;
  let inFence = false;
  const kept = [];
  for (const line of src.split('\n')) {
    // Detect against the un-quoted line so blockquote-nested markers/tables match.
    const bare = line.replace(BLOCKQUOTE_PREFIX, '');
    if (FENCE.test(bare)) inFence = !inFence;
    if (!inFence) {
      const marker = bare.match(COLWIDTHS_MARKER);
      if (marker) {
        widthsByTable[tableCount] = marker[1].split(',').map(w => parseInt(w, 10) || 0);
        continue;
      }
      if (isTableDelimiter(bare)) tableCount += 1;
    }
    kept.push(line);
  }
  return [kept.join('\n'), widthsByTable];
};

const LIST_TAG = /<(\/?)(ul|ol|li)>/g;
const LIST_NODES = { ul: 'bullet_list', ol: 'ordered_list', li: 'list_item' };

const splitAtListTags = (children, Token) => {
  const pieces = [];
  const pushText = content => {
    if (!content) return;
    const token = new Token('text', '', 0);
    token.content = content;
    pieces.push(token);
  };
  children.forEach(child => {
    if (child.type !== 'text') {
      pieces.push(child);
      return;
    }
    let end = 0;
    for (const match of child.content.matchAll(LIST_TAG)) {
      const before = child.content.slice(end, match.index).trimEnd();
      pushText(end ? before.trimStart() : before);
      pieces.push({ listTag: match[2], closing: match[1] === '/' });
      end = match.index + match[0].length;
    }
    const rest = child.content.slice(end);
    pushText(end ? rest.trimStart() : rest);
  });
  return pieces;
};

const cellListTokens = (children, Token) => {
  const pieces = splitAtListTags(children, Token);
  if (!pieces.some(piece => piece.listTag)) return null;

  const tokens = [];
  const open = [];
  let run = [];
  // A list item starts with a paragraph, even an empty one
  let paragraphDue = false;
  const closeRun = () => {
    if (!run.length && !paragraphDue) return;
    const inline = new Token('inline', '', 0);
    inline.children = run;
    tokens.push(inline);
    run = [];
    paragraphDue = false;
  };

  for (const piece of pieces) {
    const parent = open[open.length - 1];
    const inList = parent === 'ul' || parent === 'ol';
    if (!piece.listTag) {
      if (inList) return null;
      run.push(piece);
    } else if (piece.closing) {
      closeRun();
      if (open.pop() !== piece.listTag) return null;
      tokens.push(new Token(`${LIST_NODES[piece.listTag]}_close`, piece.listTag, -1));
    } else {
      const isItem = piece.listTag === 'li';
      if (isItem !== inList) return null;
      closeRun();
      open.push(piece.listTag);
      tokens.push(new Token(`${LIST_NODES[piece.listTag]}_open`, piece.listTag, 1));
      paragraphDue = isItem;
    }
  }
  closeRun();
  return open.length ? null : tokens;
};

// Runs before `text_join`, while escaped characters are still separate tokens.
const tableCellLists = state => {
  const tokens = [];
  state.tokens.forEach((token, index) => {
    const previous = state.tokens[index - 1];
    const isCellContent = previous && (previous.type === 'th_open' || previous.type === 'td_open');
    const listTokens = isCellContent ? cellListTokens(token.children, state.Token) : null;
    if (listTokens) tokens.push(...listTokens);
    else tokens.push(token);
  });
  state.tokens = tokens;
};

export const withTableTokens = (md, { cellLists = false } = {}) => {
  if (cellLists) md.core.ruler.before('text_join', 'table_cell_lists', tableCellLists);

  const originalParse = md.parse.bind(md);
  md.parse = (src, env) => {
    const [cleanedSrc, colwidthsByTable] = extractColwidths(src);
    const tokens = originalParse(cleanedSrc, env);

    const result = [];
    let tableIdx = 0;
    let widths = null;
    let inFirstRow = false;
    let colCursor = 0;
    let inCell = false;

    for (const t of tokens) {
      switch (t.type) {
        case 'thead_open':
        case 'thead_close':
        case 'tbody_open':
        case 'tbody_close':
          break;
        case 'table_open':
          widths = colwidthsByTable[tableIdx] || null;
          tableIdx += 1;
          inFirstRow = false;
          result.push(t);
          break;
        case 'tr_open':
          if (widths && !inFirstRow) { inFirstRow = true; colCursor = 0; }
          result.push(t);
          break;
        case 'tr_close':
          inFirstRow = false;
          result.push(t);
          break;
        case 'th_open':
        case 'td_open': {
          if (inFirstRow && widths) {
            const w = widths[colCursor];
            if (w > 0) t.attrSet('data-colwidth', String(w));
            colCursor += 1;
          }
          inCell = true;
          result.push(t);
          break;
        }
        case 'th_close':
        case 'td_close':
          inCell = false;
          result.push(t);
          break;
        case 'inline':
          if (inCell) result.push(paragraphToken(1), t, paragraphToken(-1));
          else result.push(t);
          break;
        default:
          result.push(t);
      }
    }
    return result;
  };
  return md;
};
