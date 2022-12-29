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
  codeInputRule,
  listInputRules,
  linksInputRules,
  blocksInputRule,
  textFormattingInputRules,
} from './rules';

import { baseKeyMaps } from './keymap';
import { buildArticleEditorMenu } from './menu/article';
import { buildMessageEditorMenu } from './menu/message';
import { tableEditing } from 'prosemirror-tables';

export { articleSchema } from './schema/article';

export {
  messageSchema,
  addMentionsToMarkdownParser,
  addMentionsToMarkdownSerializer,
} from './schema/message';

export function wootArticleWriterSetup(options) {
  let plugins = [
    history(),
    baseKeyMaps(options.schema),
    blocksInputRule(options.schema),
    codeInputRule(options.schema),
    textFormattingInputRules(options.schema),
    linksInputRules(options.schema),
    listInputRules(options.schema),
    tableEditing(),

    dropCursor(),
    gapCursor(),
    Placeholder(options.placeholder),
    menuBar({
      floating: options.floatingMenu !== false,
      content:
        options.menuContent || buildArticleEditorMenu(options.schema).fullMenu,
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

export function wootMessageWriterSetup(options) {
  let plugins = [
    history(),
    baseKeyMaps(options.schema),
    codeInputRule(options.schema),
    textFormattingInputRules(options.schema),
    linksInputRules(options.schema),
    listInputRules(options.schema),

    dropCursor(),
    gapCursor(),
    Placeholder(options.placeholder),
    menuBar({
      floating: options.floatingMenu !== false,
      content:
        options.menuContent || buildMessageEditorMenu(options.schema).fullMenu,
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
