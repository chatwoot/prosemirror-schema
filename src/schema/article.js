import { orderedList, bulletList, listItem } from 'prosemirror-schema-list';
import { tableNodes } from 'prosemirror-tables';
import { Schema } from 'prosemirror-model';
import { schema } from 'prosemirror-markdown';

const tableNodeSpecs = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
});

// Wrap table in a scrollable div for horizontal overflow
tableNodeSpecs.table.toDOM = () => ['div', { class: 'tableWrapper' }, ['table', ['tbody', 0]]];
tableNodeSpecs.table.parseDOM = [
  { tag: 'div.tableWrapper table' },
  { tag: 'table' },
];

const baseImage = schema.spec.nodes.get('image');
const image = {
  ...baseImage,
  attrs: { ...baseImage.attrs, width: { default: null } },
  parseDOM: [{
    tag: 'img[src]',
    getAttrs: dom => ({
      src: dom.getAttribute('src'),
      title: dom.getAttribute('title'),
      alt: dom.getAttribute('alt'),
      width: dom.style.width || null,
    }),
  }],
  toDOM: node => {
    const attrs = { src: node.attrs.src, alt: node.attrs.alt };
    if (node.attrs.title) attrs.title = node.attrs.title;
    if (node.attrs.width) attrs.style = `width: ${node.attrs.width}; max-width: 100%; height: auto`;
    return ['img', attrs];
  },
};

export const fullSchema = new Schema({
  nodes: {
    doc: schema.spec.nodes.get('doc'),
    paragraph: schema.spec.nodes.get('paragraph'),
    blockquote: schema.spec.nodes.get('blockquote'),
    horizontal_rule: schema.spec.nodes.get('horizontal_rule'),
    heading: schema.spec.nodes.get('heading'),
    code_block: schema.spec.nodes.get('code_block'),
    text: schema.spec.nodes.get('text'),
    image,
    hard_break: schema.spec.nodes.get('hard_break'),
    ordered_list: Object.assign(orderedList, {
      content: 'list_item+',
      group: 'block',
    }),
    bullet_list: Object.assign(bulletList, {
      content: 'list_item+',
      group: 'block',
    }),
    list_item: Object.assign(listItem, { content: 'paragraph block*' }),
    ...tableNodeSpecs,
  },
  marks: {
    link: schema.spec.marks.get('link'),
    em: schema.spec.marks.get('em'),
    superscript: {
      parseDOM: [{ tag: 'sup' }],
      toDOM() {
        return ['sup'];
      },
    },
    strong: schema.spec.marks.get('strong'),
    code: schema.spec.marks.get('code'),
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

export default fullSchema;
