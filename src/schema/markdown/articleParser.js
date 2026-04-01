import MarkdownIt from 'markdown-it';
import MarkdownItSup from 'markdown-it-sup';
import { MarkdownParser } from 'prosemirror-markdown';
import {
  baseSchemaToMdMapping,
  baseNodesMdToPmMapping,
  baseMarksMdToPmMapping,
  filterMdToPmSchemaMapping,
} from './parser';

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
const SKIP_TABLE_TOKENS = new Set([
  'thead_open', 'thead_close', 'tbody_open', 'tbody_close',
]);
const CELL_OPEN_TOKENS = new Set(['th_open', 'td_open']);
const CELL_CLOSE_TOKENS = new Set(['th_close', 'td_close']);
const originalParse = md.parse.bind(md);
md.parse = (src, env) => {
  const tokens = originalParse(src, env);
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (SKIP_TABLE_TOKENS.has(t.type)) continue;
    if (CELL_OPEN_TOKENS.has(t.type)) {
      result.push(t);
      result.push({ type: 'paragraph_open', tag: 'p', nesting: 1, attrs: null, content: '' });
    } else if (CELL_CLOSE_TOKENS.has(t.type)) {
      result.push({ type: 'paragraph_close', tag: 'p', nesting: -1, attrs: null, content: '' });
      result.push(t);
    } else {
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
    return this.markdownParser.parse(content);
  }
}
