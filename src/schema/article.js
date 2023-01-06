import { orderedList, bulletList, listItem } from 'prosemirror-schema-list';
import { Schema } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';

export const fullSchema = new Schema({
  nodes: schema.spec.nodes.append({
    ordered_list: Object.assign(orderedList, {
      content: 'list_item+',
      group: 'block',
    }),
    bullet_list: Object.assign(bulletList, {
      content: 'list_item+',
      group: 'block',
    }),
    list_item: Object.assign(listItem, { content: 'paragraph block*' }),
  }),
  // link, em, strong, code, strike
  marks: schema.spec.marks.append({
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
  }),
});

export default fullSchema;
