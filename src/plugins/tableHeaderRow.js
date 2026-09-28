import { Plugin } from "prosemirror-state";

// A markdown table always starts with a header row, so keep every table's first
// row as header cells; pasted HTML tables often arrive with plain cells only.
export default function tableHeaderRowPlugin(schema) {
  const { table, table_cell, table_header } = schema.nodes;
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const { tr } = newState;
      newState.doc.descendants((node, pos) => {
        if (node.type !== table) return true;
        // First row content starts at pos + 2 (past the table and row openings)
        node.firstChild.forEach((cell, offset) => {
          if (cell.type === table_cell) {
            tr.setNodeMarkup(pos + 2 + offset, table_header, cell.attrs);
          }
        });
        return false;
      });
      return tr.docChanged ? tr : null;
    },
  });
}
