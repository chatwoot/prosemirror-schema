import { wrapInList } from "prosemirror-schema-list";
import { toggleMark } from "prosemirror-commands";
import { MenuItem } from "prosemirror-menu";
import { undo, redo } from "prosemirror-history";
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

const copilotItem = (nodeType, onCopilotClick) => {
  return new MenuItem({
    title: "Copilot",
    icon: icons.sparkles,
    class: "ProseMirror-copilot",
    run: () => {
      onCopilotClick();
      return true;
    },
    enable() {
      return true;
    },
  });
};

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

const isInsideTable = (state, schema) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === schema.nodes.table) return true;
  }
  return false;
};

const insertTableItem = (schema) =>
  new MenuItem({
    title: "Insert table",
    icon: icons.table,
    enable(state) {
      if (!schema.nodes.table) return false;
      return !isInsideTable(state, schema);
    },
    run(state, dispatch) {
      const { table, table_row, table_header, table_cell, paragraph } =
        schema.nodes;
      const headerCells = [0, 1, 2].map(() =>
        table_header.createAndFill(null, paragraph.create())
      );
      const dataCells = [0, 1, 2].map(() =>
        table_cell.createAndFill(null, paragraph.create())
      );
      const headerRow = table_row.create(null, headerCells);
      const dataRow = table_row.create(null, dataCells);
      const tableNode = table.create(null, [headerRow, dataRow]);
      dispatch(state.tr.replaceSelectionWith(tableNode).scrollIntoView());
      return true;
    },
  });

// Items that should be hidden when selection is inside a table
const HIDE_IN_TABLE = new Set([
  'bulletList', 'orderedList', 'h1', 'h2', 'h3',
  'imageUpload', 'code', 'insertTable', 'strike', 'copilot',
]);

// Wrap a MenuItem so it's hidden (select → false) when inside a table
const hideInTable = (key, item, schema) => {
  if (!item || !schema.nodes.table || !HIDE_IN_TABLE.has(key)) return item;
  return new MenuItem({
    ...item.spec,
    select: (state) => !isInsideTable(state, schema),
  });
};

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
    ],
    onImageUpload = () => {},
    onCopilotClick = () => {},
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
    strike: markItem(schema.marks.strike, {
      title: "Toggle strikethrough",
      icon: icons.strike,
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
    insertTable: schema.nodes.table ? insertTableItem(schema) : null,
    copilot: copilotItem(schema.nodes.copilot, onCopilotClick),
  };

  return [
    enabledMenuOptions
      .filter((menuOptionKey) => !!availableMenuOptions[menuOptionKey])
      .map((key) => hideInTable(key, availableMenuOptions[key], schema)),
  ];
};

export default buildMenuOptions;
