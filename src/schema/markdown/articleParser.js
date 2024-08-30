import MarkdownIt from 'markdown-it';
import MarkdownItSup from 'markdown-it-sup';
import { MarkdownParser } from 'prosemirror-markdown';
import markdownItTable from '../../rules/tables';

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
    // table: 'table',
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
  table: { 
    node: 'table',
    getAttrs: tok => ({ alignment: tok.info })
  },
  tr: {
    node: 'table_row',
  },
  td: {
    node: 'table_cell',
    getAttrs: tok => ({
      colspan: +(tok.attrGet("colspan") || 1),
      rowspan: +(tok.attrGet("rowspan") || 1),
      alignment: tok.info,
    }),
  },
  th: {
    node: 'table_header',
    getAttrs: tok => ({
      colspan: +(tok.attrGet("colspan") || 1),
      rowspan: +(tok.attrGet("rowspan") || 1),
      alignment: tok.info,
    }),
  },
};

const md = MarkdownIt('commonmark', {
  html: false,
  linkify: true,
  breaks: true,
}).use(MarkdownItSup).use(markdownItTable);

md.enable([
  // Process html entity - &#123;, &#xAF;, &quot;, ...
  'entity',
  // Process escaped chars and hardbreaks
  'escape',
  'hr',
  // 'table',
]);

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