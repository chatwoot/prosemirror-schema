import {
  moveRight,
  moveLeft,
  cleanUpAtTheStartOfDocument,
  createNewParagraphBelow,
  createNewParagraphAbove,
} from './commands';
import {
  enterKeyOnListCommand,
  indentList,
  outdentList,
  splitListItem,
} from './rules/lists';
import {
  goToNextCell,
  addRowAfter,
  CellSelection,
  deleteRow,
  deleteColumn,
  deleteTable,
  TableMap,
} from 'prosemirror-tables';
import { TextSelection } from 'prosemirror-state';

import {
  chainCommands,
  toggleMark,
  exitCode,
  joinUp,
  joinDown,
  selectParentNode,
  baseKeymap,
  deleteSelection,
  joinBackward,
  selectNodeBackward,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  splitBlock,
} from 'prosemirror-commands';

import { undo, redo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';

const mac =
  typeof navigator !== 'undefined' ? /Mac/.test(navigator.platform) : false;

// Find the table node at the given depth from $from, or -1
function findTableDepth($from, tableType) {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === tableType) return d;
  }
  return -1;
}

// Find the cell node depth between tableDepth and $from.depth
function findCellDepth($from, tableDepth, cellType, headerType) {
  for (let d = $from.depth; d > tableDepth; d--) {
    const t = $from.node(d).type;
    if (t === cellType || t === headerType) return d;
  }
  return -1;
}

export function baseKeyMaps(schema) {
  let keys = { ...baseKeymap };
  function bind(key, cmd) {
    keys[key] = cmd;
  }

  bind('Mod-z', chainCommands(undoInputRule, undo));
  bind('Shift-Mod-z', redo);
  const backspaceComands = chainCommands(
    undoInputRule,
    cleanUpAtTheStartOfDocument,
    deleteSelection,
    joinBackward,
    selectNodeBackward
  );
  bind('Backspace', backspaceComands);
  bind('Mod-Backspace', backspaceComands);

  if (!mac) bind('Mod-y', redo);

  bind('Alt-ArrowUp', joinUp);
  bind('Alt-ArrowDown', joinDown);
  bind('Escape', selectParentNode);

  if (schema.nodes.table) {
    // Progressive Cmd+A: cell content → all cells → whole document
    bind('Mod-a', (state, dispatch) => {
      const { $from, from, to } = state.selection;
      const tableDepth = findTableDepth($from, schema.nodes.table);
      if (tableDepth < 0) return false;

      // Already a CellSelection → select entire document
      if (state.selection instanceof CellSelection) {
        if (dispatch) {
          dispatch(state.tr.setSelection(
            TextSelection.create(state.doc, 0, state.doc.content.size)
          ));
        }
        return true;
      }

      const cellDepth = findCellDepth(
        $from, tableDepth, schema.nodes.table_cell, schema.nodes.table_header
      );
      if (cellDepth < 0) return false;

      const cellStart = $from.start(cellDepth);
      const cellEnd = $from.end(cellDepth);

      // Cell not fully selected → select all cell content
      if (from !== cellStart || to !== cellEnd) {
        if (dispatch) {
          dispatch(state.tr.setSelection(
            TextSelection.create(state.doc, cellStart, cellEnd)
          ));
        }
        return true;
      }

      // Cell fully selected → select all cells (CellSelection)
      if (dispatch) {
        const tableNode = $from.node(tableDepth);
        const tableStart = $from.before(tableDepth) + 1;

        // First cell: tableStart + 1 (into row) + 1 (into cell)
        const firstCellPos = tableStart + 2;

        // Last cell: walk to the last row's last cell
        let lastCellPos = tableStart;
        for (let r = 0; r < tableNode.childCount; r++) {
          lastCellPos++; // row open
          const row = tableNode.child(r);
          for (let c = 0; c < row.childCount; c++) {
            if (r === tableNode.childCount - 1 && c === row.childCount - 1) {
              lastCellPos++; // this is the last cell position (inside it)
            } else {
              lastCellPos += row.child(c).nodeSize;
            }
          }
          if (r < tableNode.childCount - 1) {
            lastCellPos++; // row close
          }
        }

        try {
          const $first = state.doc.resolve(firstCellPos);
          const $last = state.doc.resolve(lastCellPos);
          dispatch(state.tr.setSelection(
            CellSelection.create(state.doc, $first.before($first.depth), $last.before($last.depth))
          ));
        } catch (_) {
          // Fallback: select whole document if cell positions are invalid
          dispatch(state.tr.setSelection(
            TextSelection.create(state.doc, 0, state.doc.content.size)
          ));
        }
      }
      return true;
    });

    // Backspace/Delete on CellSelection: delete selected rows, columns, or entire table
    const deleteCellSelection = (state, dispatch) => {
      if (!(state.selection instanceof CellSelection)) return false;

      const sel = state.selection;
      const { $anchorCell, $headCell } = sel;

      // Find the table
      let tableDepth = -1;
      for (let d = $anchorCell.depth; d >= 0; d--) {
        if ($anchorCell.node(d).type === schema.nodes.table) {
          tableDepth = d;
          break;
        }
      }
      if (tableDepth < 0) return false;

      const tableNode = $anchorCell.node(tableDepth);
      const map = TableMap.get(tableNode);

      // Count selected rows and columns
      const selectedCells = new Set();
      sel.forEachCell((_node, pos) => selectedCells.add(pos));

      const totalCells = map.width * map.height;

      // All cells selected → delete entire table
      if (selectedCells.size >= totalCells) {
        return deleteTable(state, dispatch);
      }

      // Check if entire rows are selected
      const selectedRows = new Set();
      const selectedCols = new Set();
      for (const pos of selectedCells) {
        const rect = map.findCell(pos - ($anchorCell.before(tableDepth) + 1));
        selectedRows.add(rect.top);
        selectedCols.add(rect.left);
      }

      const isFullRows = selectedCells.size === selectedRows.size * map.width;
      const isFullCols = selectedCells.size === selectedCols.size * map.height;

      if (isFullRows && selectedRows.size < map.height) {
        return deleteRow(state, dispatch);
      }
      if (isFullCols && selectedCols.size < map.width) {
        return deleteColumn(state, dispatch);
      }

      // Partial selection: just clear cell contents
      if (dispatch) {
        let tr = state.tr;
        sel.forEachCell((cell, pos) => {
          const start = pos + 1;
          const end = pos + cell.nodeSize - 1;
          if (end > start) {
            tr = tr.replaceWith(
              tr.mapping.map(start),
              tr.mapping.map(end),
              schema.nodes.paragraph.create()
            );
          }
        });
        dispatch(tr);
      }
      return true;
    };

    bind('Backspace', chainCommands(deleteCellSelection, backspaceComands));
    bind('Delete', chainCommands(deleteCellSelection, deleteSelection));
    bind('Mod-Backspace', chainCommands(deleteCellSelection, backspaceComands));
  }

  bind('ArrowLeft', moveLeft());
  bind('ArrowRight', moveRight());
  bind('ArrowDown', createNewParagraphBelow);
  bind('ArrowUp', createNewParagraphAbove);

  if (schema.marks.strong) {
    bind('Mod-b', toggleMark(schema.marks.strong));
    bind('Mod-B', toggleMark(schema.marks.strong));
  }

  if (schema.marks.em) {
    bind('Mod-i', toggleMark(schema.marks.em));
    bind('Mod-I', toggleMark(schema.marks.em));
  }

  if (schema.marks.superscript) {
    bind('Shift-Mod-.', toggleMark(schema.marks.superscript));
  }

  if (schema.nodes.hard_break) {
    let br = schema.nodes.hard_break,
      cmd = chainCommands(exitCode, (state, dispatch) => {
        dispatch(
          state.tr
            .insertText(` `)
            .replaceSelectionWith(br.create())
            .scrollIntoView()
        );
        return true;
      });
    bind('Mod-Enter', cmd);
    bind('Shift-Enter', cmd);
    if (mac) bind('Ctrl-Enter', cmd);
  }
  const modEnter = mac ? 'Mod-Enter' : 'Ctrl-Enter';

  const enterCommands = [
    newlineInCode,
    createParagraphNear,
    liftEmptyBlock,
    splitBlock,
  ];

  if (schema.nodes.list_item) {
    enterCommands.unshift(enterKeyOnListCommand);

    // TODO: Remove hacky fix
    // This needs to done only when the editor sends messages on Enter.
    // Currently Mod+enter command is never reached as it is overridden at the editor
    //  side with Cmd+Enter for sending messages.
    // Fix this by using a different keymap or overriding existing keymap on condition.
    
    enterCommands.unshift(splitListItem(schema.nodes.list_item));

    if (schema.nodes.table) {
      const tabInTable = (state, dispatch) =>
        goToNextCell(1)(state, dispatch) ||
        (addRowAfter(state, dispatch) && goToNextCell(1)(state, dispatch));
      bind("Tab", chainCommands(tabInTable, indentList()));
      bind("Shift-Tab", chainCommands(goToNextCell(-1), outdentList()));
    } else {
      bind("Tab", indentList());
      bind("Shift-Tab", outdentList());
    }
  } else if (schema.nodes.table) {
    bind('Tab', goToNextCell(1));
    bind('Shift-Tab', goToNextCell(-1));
  }

  bind('Enter', chainCommands.apply(null, enterCommands));
  bind(modEnter, chainCommands.apply(null, enterCommands));
  return keymap(keys);
}
