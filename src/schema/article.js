import { schema } from 'prosemirror-markdown';
import { Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

export const articleSchema = new Schema({
  nodes: schema.spec.nodes.append(
    tableNodes({
      tableGroup: 'block',
      cellContent: 'block+',
      cellAttributes: {
        background: {
          default: null,
          getFromDOM(dom) {
            return dom.style.backgroundColor || null;
          },
          setDOMAttr(value, attrs) {
            if (value)
              attrs.style = (attrs.style || '') + `background-color: ${value};`;
          },
        },
      },
    })
  ),
  marks: schema.spec.marks,
});
