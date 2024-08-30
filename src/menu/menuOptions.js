import { wrapInList } from "prosemirror-schema-list";
import { TextSelection } from 'prosemirror-state';
import { Fragment } from 'prosemirror-model';
import { toggleMark } from "prosemirror-commands";
import { Dropdown, DropdownSubmenu, MenuItem } from "prosemirror-menu";
import { undo, redo } from "prosemirror-history";
import {
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  deleteTable,
} from 'prosemirror-tables';

import { openPrompt } from "../prompt";
import { TextField } from "../TextField";
import {
  blockTypeIsActive,
  cmdItem,
  markItem,
  toggleBlockType,
} from "./common";
import icons from "../icons";
import { markActive } from "../utils";

const wrapListItem = (nodeType, options) =>
  cmdItem(wrapInList(nodeType, options.attrs), options);

const imageUploadItem = (nodeType, onImageUpload) =>
  new MenuItem({
    title: "Upload image",
    icon: icons.image,
    enable() {
      return true;
    },
    run() {
      onImageUpload();
      return true;
    },
  });

const headerItem = (nodeType, options) => {
  const { level = 1 } = options;
  return new MenuItem({
    title: `Heading ${level}`,
    icon: options.icon,
    active(state) {
      return blockTypeIsActive(state, nodeType, { level });
    },
    enable() {
      return true;
    },
    run(state, dispatch, view) {
      if (blockTypeIsActive(state, nodeType, { level })) {
        toggleBlockType(nodeType, { level })(state, dispatch);
        return true;
      }

      toggleBlockType(nodeType, { level })(view.state, view.dispatch);
      view.focus();

      return false;
    },
  });
};

const createTable = (state, dispatch) => {
  const offset = state.tr.selection.anchor + 1;
  const transaction = state.tr;
  const createCell = () => state.schema.nodes.table_cell.createAndFill(null, state.schema.nodes.paragraph.create());
  const node = state.schema.nodes.table.create(
    null,
    Fragment.fromArray([
      state.schema.nodes.table_row.create(
        null,
        Fragment.fromArray([createCell(), createCell(), createCell()])
      ),
      state.schema.nodes.table_row.create(
        null,
        Fragment.fromArray([createCell(), createCell(), createCell()])
      )
    ])
  );

  if (dispatch) {
    dispatch(
      transaction
        .replaceSelectionWith(node)
        .setSelection(
          TextSelection.near(
            transaction.doc.resolve(offset)
          )
        )
    );
  }

  return true;
}

const tableMenu = [
  { 
    label: 'Insert table', 
    run: createTable,
    icon: icons.insertTable // Assuming you have this icon
  },
  { label: 'Delete table', run: deleteTable, select: deleteTable, icon: icons.deleteTable },
  { label: 'Insert column before', run: addColumnBefore, select: addColumnBefore, icon: icons.insertColumnBefore },
  { label: 'Insert column after', run: addColumnAfter, select: addColumnAfter, icon: icons.insertColumnAfter },
  { label: 'Delete column', run: deleteColumn, select: deleteColumn, icon: icons.deleteColumn },
  { label: 'Insert row before', run: addRowBefore, select: addRowBefore, icon: icons.insertRowBefore },
  { label: 'Insert row after', run: addRowAfter, select: addRowAfter, icon: icons.insertRowAfter },
  { label: 'Delete row', run: deleteRow, select: deleteRow, icon: icons.deleteRow },
  { label: 'Merge cells', run: mergeCells, select: mergeCells, icon: icons.mergeCells },
  { label: 'Split cell', run: splitCell, select: splitCell, icon: icons.splitCell },
];

const linkItem = (markType) =>
  new MenuItem({
    title: "Add or remove link",
    icon: icons.link,
    active(state) {
      return markActive(state, markType);
    },
    enable(state) {
      return !state.selection.empty;
    },
    run(state, dispatch, view) {
      if (markActive(state, markType)) {
        toggleMark(markType)(state, dispatch);
        return true;
      }
      openPrompt({
        title: "Create a link",
        fields: {
          href: new TextField({
            label: "https://example.com",
            class: "small",
            required: true,
          }),
        },
        callback(attrs) {
          toggleMark(markType, attrs)(view.state, view.dispatch);
          view.focus();
        },
      });
      return false;
    },
  });

const buildMenuOptions = (
  schema,
  {
    enabledMenuOptions = [
      "strong",
      "em",
      "code",
      "link",
      "undo",
      "redo",
      "bulletList",
      "orderedList",
      "table",
    ],
    onImageUpload = () => {},
  }
) => {
  const availableMenuOptions = {
    strong: markItem(schema.marks.strong, {
      title: "Toggle strong style",
      icon: icons.strong,
    }),
    em: markItem(schema.marks.em, {
      title: "Toggle emphasis",
      icon: icons.em,
    }),
    code: markItem(schema.marks.code, {
      title: "Toggle code font",
      icon: icons.code,
    }),
    link: linkItem(schema.marks.link),
    bulletList: wrapListItem(schema.nodes.bullet_list, {
      title: "Wrap in bullet list",
      icon: icons.bulletList,
    }),
    orderedList: wrapListItem(schema.nodes.ordered_list, {
      title: "Wrap in ordered list",
      icon: icons.orderedList,
    }),
    undo: new MenuItem({
      title: "Undo last change",
      run: undo,
      enable: (state) => undo(state),
      icon: icons.undo,
    }),
    redo: new MenuItem({
      title: "Redo last undone change",
      run: redo,
      enable: (state) => redo(state),
      icon: icons.redo,
    }),
    h1: headerItem(schema.nodes.heading, {
      level: 1,
      title: "Toggle code font",
      icon: icons.h1,
    }),
    h2: headerItem(schema.nodes.heading, {
      level: 2,
      title: "Toggle code font",
      icon: icons.h2,
    }),
    h3: headerItem(schema.nodes.heading, {
      level: 3,
      title: "Toggle code font",
      icon: icons.h3,
    }),
    imageUpload: imageUploadItem(schema.nodes.image, onImageUpload),
    table: new Dropdown(tableMenu.map(item => new MenuItem({
      title: item.label,
      label: item.label,
      run: item.run,
      select: item.select,
      enable: item.enable,
    })), {
      label: "Table",
      title: "Table operations",
      icon: icons.table,
      class: "prosemirror-menu-table-dropdown",
    }),
  };

  const menuItems = enabledMenuOptions
    .filter((menuOptionKey) => !!availableMenuOptions[menuOptionKey])
    .map((menuOptionKey) => availableMenuOptions[menuOptionKey]);

  return [menuItems];
};

export default buildMenuOptions;
