import {
  schema,
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';

import { Schema, DOMParser } from 'prosemirror-model';

const mentionParser = () => ({
  node: 'mention',
  getAttrs: ({ mention }) => {
    const { userId, userFullName } = mention;
    return { userId, userFullName };
  },
});

const markdownSerializer = () => (state, node) => {
  const uri = state.esc(
    `mention://user/${node.attrs.userId}/${encodeURIComponent(
      node.attrs.userFullName
    )}`
  );
  const escapedDisplayName = state.esc('@' + (node.attrs.userFullName || ''));

  state.write(`[${escapedDisplayName}](${uri})`);
};

export const addMentionsToMarkdownSerializer = () => {
  const result = new MarkdownSerializer(
    {
      mention: markdownSerializer(),
      ...defaultMarkdownSerializer.nodes,
    },
    defaultMarkdownSerializer.marks
  );
  return result;
};

export const plainTextSerializer = () => {
  const { text, paragraph, hard_break } = defaultMarkdownSerializer.nodes;
  const result = new MarkdownSerializer({ text, paragraph, hard_break }, {});
  return result;
};

const mentionNode = {
  attrs: { userFullName: { default: '' }, userId: { default: '' } },
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: true,
  atom: true,
  toDOM: node => [
    'span',
    {
      class: 'prosemirror-mention-node',
      'mention-user-id': node.attrs.userId,
      'mention-user-full-name': node.attrs.userFullName,
    },
    `@${node.attrs.userFullName}`,
  ],
  parseDOM: [
    {
      tag: 'span[mention-user-id][mention-user-full-name]',
      getAttrs: dom => {
        const userId = dom.getAttribute('mention-user-id');
        const userFullName = dom.getAttribute('mention-user-full-name');
        return { userId, userFullName };
      },
    },
  ],
};

const addMentionNodes = nodes => nodes.append({ mention: mentionNode });

export const schemaWithMentions = new Schema({
  nodes: addMentionNodes(schema.spec.nodes),
  marks: schema.spec.marks,
});

export const addMentionsToMarkdownParser = () => {
  return new MarkdownParser(
    schemaWithMentions,
    defaultMarkdownParser.tokenizer,
    {
      ...defaultMarkdownParser.tokens,
      mention: mentionParser(),
    }
  );
};

export const defaultPlainTextSchema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },

    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },

    text: {
      group: 'inline',
    },

    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() {
        return ['br'];
      },
    },
  },

  marks: {},
});

export const plainTextParser = () =>
  DOMParser.fromSchema(defaultPlainTextSchema);
