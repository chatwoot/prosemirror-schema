import {
  schema,
  MarkdownParser,
  MarkdownSerializer,
} from 'prosemirror-markdown';

import { Schema } from 'prosemirror-model';

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

export const addMentionsToMarkdownSerializer = serializer =>
  new MarkdownSerializer(
    { mention: markdownSerializer(), ...serializer.nodes },
    serializer.marks
  );

export const messageSchema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },

    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: function toDOM() {
        return ['p', 0];
      },
    },

    blockquote: {
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: function toDOM() {
        return ['blockquote', 0];
      },
    },

    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM() {
        return ['div'];
      },
    },

    heading: {
      attrs: { level: { default: 1 } },
      content: 'text*',
      group: 'block',
      defining: true,
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 4 } },
        { tag: 'h5', attrs: { level: 5 } },
        { tag: 'h6', attrs: { level: 6 } },
      ],
      toDOM(node) {
        return ['p', 0];
      },
    },

    code_block: {
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      marks: '',
      attrs: { params: { default: '' } },
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs: function (node) {
            return { params: node.getAttribute('data-params') || '' };
          },
        },
      ],
      toDOM: function toDOM(node) {
        return [
          'pre',
          node.attrs.params ? { 'data-params': node.attrs.params } : {},
          ['code', 0],
        ];
      },
    },

    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 }, tight: { default: false } },
      parseDOM: [
        {
          tag: 'ol',
          getAttrs: function getAttrs(dom) {
            return {
              order: dom.hasAttribute('start') ? +dom.getAttribute('start') : 1,
              tight: dom.hasAttribute('data-tight'),
            };
          },
        },
      ],
      toDOM: function toDOM(node) {
        return [
          'ol',
          {
            start: node.attrs.order == 1 ? null : node.attrs.order,
            'data-tight': node.attrs.tight ? 'true' : null,
          },
          0,
        ];
      },
    },

    bullet_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { tight: { default: false } },
      parseDOM: [
        {
          tag: 'ul',
          getAttrs: function (dom) {
            return { tight: dom.hasAttribute('data-tight') };
          },
        },
      ],
      toDOM: function toDOM(node) {
        return ['ul', { 'data-tight': node.attrs.tight ? 'true' : null }, 0];
      },
    },

    list_item: {
      content: 'paragraph block*',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM: function toDOM() {
        return ['li', 0];
      },
    },

    text: {
      group: 'inline',
    },

    image: {
      inline: true,
      attrs: {
        src: {},
        alt: { default: null },
        title: { default: null },
      },
      group: 'inline',
      draggable: true,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs(dom) {
            return {
              src: dom.getAttribute('src'),
              title: dom.getAttribute('title'),
            };
          },
        },
      ],
      toDOM(node) {
        console.log('node', node);
        return ['span', node.attrs.src];
      },
    },

    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: function toDOM() {
        return ['br'];
      },
    },
    mention: {
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
    },
  },
  marks: schema.spec.marks,
});

export const addMentionsToMarkdownParser = parser => {
  return new MarkdownParser(messageSchema, parser.tokenizer, {
    ...parser.tokens,
    mention: mentionParser(),
  });
};
