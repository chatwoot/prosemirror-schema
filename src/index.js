import { history } from 'prosemirror-history';
import { Plugin } from 'prosemirror-state';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { menuBar } from 'prosemirror-menu';

import Placeholder from './Placeholder';

export { EditorState, Selection } from 'prosemirror-state';
export { EditorView } from 'prosemirror-view';
export {
  schema,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';

import {
  listInputRules,
  linksInputRules,
  blocksInputRule,
  textFormattingInputRules,
} from './rules';

import { baseKeyMaps } from './keymap';
import { buildFullEditorMenuItems } from './menu/full';
import { buildMenuItems } from './menu/basic';

export { buildMenuItems, buildFullEditorMenuItems };

// !! This module exports helper functions for deriving a set of basic
// menu items, input rules, or key bindings from a schema. These
// values need to know about the schema for two reasons—they need
// access to specific instances of node and mark types, and they need
// to know which of the node and mark types that they know about are
// actually present in the schema.
//
// The `exampleSetup` plugin ties these together into a plugin that
// will automatically enable this basic functionality in an editor.

// :: (Object) → [Plugin]
// A convenience plugin that bundles together a simple menu with basic
// key bindings, input rules, and styling for the example schema.
// Probably only useful for quickly setting up a passable
// editor—you'll need more control over your settings in most
// real-world situations.
//
//   options::- The following options are recognized:
//
//     schema:: Schema
//     The schema to generate key bindings and menu items for.
//
//     mapKeys:: ?Object
//     Can be used to [adjust](#example-setup.buildKeymap) the key bindings created.
//
//     menuBar:: ?bool
//     Set to false to disable the menu bar.
//
//     history:: ?bool
//     Set to false to disable the history plugin.
//
//     floatingMenu:: ?bool
//     Set to false to make the menu bar non-floating.
//
//     menuContent:: [[MenuItem]]
//     Can be used to override the menu content.
export function wootFullWriterSetup(options) {
  let plugins = [
    history(),
    baseKeyMaps(options.schema),
    blocksInputRule(options.schema),
    textFormattingInputRules(options.schema),
    linksInputRules(options.schema),
    listInputRules(options.schema),

    dropCursor(),
    gapCursor(),
    Placeholder(options.placeholder),
    menuBar({
      floating: options.floatingMenu !== false,
      content:
        options.menuContent ||
        buildFullEditorMenuItems(options.schema).fullMenu,
    }),
    new Plugin({
      props: {
        attributes: { class: 'ProseMirror-woot-style' },
      },
    }),
    ...(options.plugins || []),
  ];

  return plugins;
}
