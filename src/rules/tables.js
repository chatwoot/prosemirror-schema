import { InputRule } from "prosemirror-inputrules";
import { NodeType, Schema } from "prosemirror-model";
import { EditorState, TextSelection, Transaction } from "prosemirror-state";

function createTable(schema, rowsCount, colsCount) {
  const {
    table,
    table_row: tableRow,
    table_cell: tableCell,
    table_header: tableHeader,
    paragraph,
  } = schema.nodes;

  const cells = [];
  for (let i = 0; i < colsCount; i++) {
    cells.push(
      tableHeader.createAndFill() || tableCell.createAndFill()
    );
  }

  const rows = [];
  for (let i = 0; i < rowsCount; i++) {
    rows.push(tableRow.createChecked(null, cells));
  }

  return table.createChecked(null, rows);
}

export function tableInputRule(schema) {
  return new InputRule(
    /^\|\s+([\s\S]*)\s+\|\s*$/,
    (state, match, start, end) => {
      const [okay, columns] = match;
      if (okay) {
        const parts = columns.split("|").map((s) => s.trim());
        const table = createTable(schema, 1, parts.length);

        const tr = state.tr.replaceRangeWith(start, end, table);
        const selection = TextSelection.create(
          tr.doc,
          start + 1
        );
        return tr.setSelection(selection);
      }
      return null;
    }
  );
}

export default tableInputRule;