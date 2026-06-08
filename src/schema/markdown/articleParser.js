import MarkdownIt from 'markdown-it';
import MarkdownItSup from 'markdown-it-sup';
import { MarkdownParser } from 'prosemirror-markdown';
import {
  baseSchemaToMdMapping,
  baseNodesMdToPmMapping,
  baseMarksMdToPmMapping,
  filterMdToPmSchemaMapping,
} from './parser';
import { isolateImagesInDoc } from '../../plugins/isolateImages';

export const articleSchemaToMdMapping = {
  nodes: {
    ...baseSchemaToMdMapping.nodes,
    rule: 'hr',
    heading: ['heading'],
    image: 'image',
    table: 'table',
  },
  marks: { ...baseSchemaToMdMapping.marks },
};

export const articleMdToPmMapping = {
  ...baseNodesMdToPmMapping,
  ...baseMarksMdToPmMapping,
  hr: { node: 'horizontal_rule' },
  heading: {
    block: 'heading',
    attrs: tok => ({ level: +tok.tag.slice(1) }),
  },
  mention: {
    node: 'mention',
    getAttrs: ({ mention }) => {
      const { userId, userFullName } = mention;
      return { userId, userFullName };
    },
  },
};

const md = MarkdownIt('commonmark', {
  html: false,
  linkify: true,
  breaks: true,
}).use(MarkdownItSup);

md.enable([
  // Process html entity - &#123;, &#xAF;, &quot;, ...
  'entity',
  // Process escaped chars and hardbreaks
  'escape',
  'hr',
]);

// Preprocess markdown-it table tokens for ProseMirror compatibility:
// 1. Strip thead/tbody wrappers — ProseMirror tables have no equivalent nodes.
// 2. Wrap cell (th/td) inline content in paragraph tokens — ProseMirror table cells
//    require block content (content: 'block+'), but markdown-it emits raw inline tokens.
// 3. Pull `<!--cw-colwidths:...-->` markers out of the source and re-apply the
//    widths to each table's first-row cells (so columnResizing widths survive
//    a markdown round-trip).
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

const originalParse = md.parse.bind(md);
md.parse = (src, env) => {
  const [cleanedSrc, colwidthsByTable] = extractColwidths(src);
  const tokens = originalParse(cleanedSrc, env);

  const result = [];
  let tableIdx = 0;
  let widths = null;
  let inFirstRow = false;
  let colCursor = 0;

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
        result.push(t, paragraphToken(1));
        break;
      }
      case 'th_close':
      case 'td_close':
        result.push(paragraphToken(-1), t);
        break;
      default:
        result.push(t);
    }
  }
  return result;
};

export class ArticleMarkdownTransformer {
  constructor(schema, tokenizer = md) {
    // Enable markdown plugins based on schema
    ['nodes', 'marks'].forEach(key => {
      for (const idx in articleSchemaToMdMapping[key]) {
        if (schema[key][idx]) {
          tokenizer.enable(articleSchemaToMdMapping[key][idx]);
        }
      }
    });

    this.markdownParser = new MarkdownParser(
      schema,
      tokenizer,
      filterMdToPmSchemaMapping(schema, articleMdToPmMapping)
    );
  }
  encode(_node) {
    throw new Error('This is not implemented yet');
  }

  parse(content) {
    // Isolate images the same way the live editor does (isolateImagesPlugin),
    // so a parse → serialize round-trip matches the editor's output.
    return isolateImagesInDoc(this.markdownParser.parse(content));
  }
}
