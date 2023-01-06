import { orderedList, bulletList, listItem } from 'prosemirror-schema-list';
import { nodes, marks } from 'prosemirror-schema-basic';

import { Schema } from 'prosemirror-model';

export const messageSchema = new Schema({
  nodes: {
    doc: nodes.doc,
    paragraph: nodes.paragraph,
    blockquote: nodes.blockquote,
    code_block: nodes.code_block,
    text: nodes.text,
    hard_break: nodes.hard_break,
    ordered_list: Object.assign(orderedList, {
      content: 'list_item+',
      group: 'block',
    }),
    bullet_list: Object.assign(bulletList, {
      content: 'list_item+',
      group: 'block',
    }),
    list_item: Object.assign(listItem, { content: 'paragraph block*' }),
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
  marks: {
    ...marks,
    strike: {
      parseDOM: [
        { tag: 's' },
        { tag: 'del' },
        { tag: 'strike' },
        {
          style: 'text-decoration',
          getAttrs: value => value === 'line-through',
        },
      ],
      toDOM: () => ['s', 0],
    },
  },
});
