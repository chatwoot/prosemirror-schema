import MarkdownIt from 'markdown-it';
import { MarkdownParser } from 'prosemirror-markdown';
import {
  baseSchemaToMdMapping,
  baseNodesMdToPmMapping,
  baseMarksMdToPmMapping,
  filterMdToPmSchemaMapping,
} from './parser';
import { isolateImagesInDoc } from '../../plugins/isolateImages';
import { withTableTokens } from './tableTokens';

export const messageSchemaToMdMapping = {
  nodes: { ...baseSchemaToMdMapping.nodes, table: 'table' },
  marks: { ...baseSchemaToMdMapping.marks },
};

export const messageMdToPmMapping = {
  ...baseNodesMdToPmMapping,
  ...baseMarksMdToPmMapping,
  mention: {
    node: 'mention',
    getAttrs: ({ mention }) => {
      const { userId, userFullName, mentionType = 'user' } = mention;
      const attrs = { userId, userFullName, mentionType };
      
      return attrs;
    },
  },
  tools: {
    node: 'tools',
    getAttrs: ({ tools }) => {
      const { id, name } = tools;
      return { id, name };
    },
  },
};

// Rules are enabled per schema, so each schema gets its own tokenizer; a shared
// one would leak rules (e.g. tables) into editors whose schema lacks them.
const tokenizers = new WeakMap();

const tokenizerFor = schema => {
  if (!tokenizers.has(schema)) {
    const md = MarkdownIt('commonmark', {
      html: false,
      linkify: false,
    });

    md.enable([
      // Process html entity - &#123;, &#xAF;, &quot;, ...
      'entity',
      // Process escaped chars and hardbreaks
      'escape',
    ]);

    md.disable(['table', 'hr', 'heading', 'lheading'], true);
    tokenizers.set(schema, schema.nodes.table ? withTableTokens(md) : md);
  }
  return tokenizers.get(schema);
};

export class MessageMarkdownTransformer {
  constructor(schema, tokenizer = tokenizerFor(schema)) {
    // Enable markdown plugins based on schema
    ['nodes', 'marks'].forEach(key => {
      for (const idx in messageSchemaToMdMapping[key]) {
        if (schema[key][idx]) {
          tokenizer.enable(messageSchemaToMdMapping[key][idx]);
        }
      }
    });

    this.markdownParser = new MarkdownParser(
      schema,
      tokenizer,
      filterMdToPmSchemaMapping(schema, messageMdToPmMapping)
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
