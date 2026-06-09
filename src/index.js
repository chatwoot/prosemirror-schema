import { history } from "prosemirror-history";
import { Plugin } from "prosemirror-state";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { menuBar } from "prosemirror-menu";
import { tableEditing, columnResizing } from "prosemirror-tables";

import Placeholder from "./Placeholder";
import {
  listInputRules,
  linksInputRules,
  hrInputRules,
  blocksInputRule,
  baseKeyMaps,
  textFormattingInputRules,
} from "./rules/index";
import buildMenuOptions from "./menu/menuOptions";
import { autoLinkURLs } from "./plugins/autoLink";
import { tableControlsPlugin } from "./plugins/table";
import isolateImagesPlugin from "./plugins/isolateImages";

export { EditorState, Selection } from "prosemirror-state";
export { EditorView } from "prosemirror-view";

export { MessageMarkdownTransformer } from "./schema/markdown/messageParser";
export { ArticleMarkdownTransformer } from "./schema/markdown/articleParser";

export { ArticleMarkdownSerializer } from "./schema/markdown/articleSerializer";
export { MessageMarkdownSerializer } from "./schema/markdown/messageSerializer";

export { fullSchema } from "./schema/article";
export { messageSchema } from "./schema/message";
export { buildMessageSchema } from "./schema/schemaBuilder";

export { imageResizeView } from "./nodeViews/imageResize";

export const buildEditor = ({
  schema,
  placeholder,
  methods: { onImageUpload, onCopilotClick } = {},
  plugins = [],
  enabledMenuOptions,
}) =>
  [
    ...(plugins || []),
    history(),
    baseKeyMaps(schema),
    blocksInputRule(schema),
    textFormattingInputRules(schema),
    linksInputRules(schema),
    autoLinkURLs(schema),
    hrInputRules(schema),
    listInputRules(schema),
    dropCursor(),
    gapCursor(),
    schema.nodes.table ? columnResizing({ cellMinWidth: 50 }) : null,
    schema.nodes.table ? tableEditing() : null,
    schema.nodes.table ? tableControlsPlugin(schema) : null,
    // editor with images (messages and articles): keep each image alone on its line.
    schema.nodes.image ? isolateImagesPlugin() : null,
    Placeholder(placeholder),
    menuBar({
      floating: true,
      content: buildMenuOptions(schema, {
        enabledMenuOptions,
        onImageUpload,
        onCopilotClick,
      }),
    }),
    new Plugin({
      props: {
        attributes: { class: "ProseMirror-woot-style" },
      },
    }),
  ].filter(Boolean);
