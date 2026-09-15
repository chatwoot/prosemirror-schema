import { tableNodes } from 'prosemirror-tables';

// Tables render inside a wrapper that scrolls horizontally when they overflow.
export const createTableNodes = cellContent => {
  const specs = tableNodes({ tableGroup: 'block', cellContent });
  specs.table.toDOM = () => ['div', { class: 'tableWrapper' }, ['table', ['tbody', 0]]];
  specs.table.parseDOM = [{ tag: 'div.tableWrapper table' }, { tag: 'table' }];
  return specs;
};
