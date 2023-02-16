import { history } from 'prosemirror-history';
import { Plugin } from 'prosemirror-state';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { menuBar } from 'prosemirror-menu';

import Placeholder from './Placeholder';

export { EditorState, Selection } from 'prosemirror-state';
export { EditorView } from 'prosemirror-view';
import {
  listInputRules,
  linksInputRules,
  blocksInputRule,
  baseKeyMaps,
  textFormattingInputRules,
} from './rules';

import { buildArticleEditorMenu } from './menu/article';
import { buildMessageEditorMenu } from './menu/message';

export { MessageMarkdownTransformer } from './schema/markdown/messageParser';
export { ArticleMarkdownTransformer } from './schema/markdown/articleParser';

export { ArticleMarkdownSerializer } from './schema/markdown/articleSerializer';
export { MessageMarkdownSerializer } from './schema/markdown/messageSerializer';

export { fullSchema } from './schema/article';
export { messageSchema } from './schema/message';

export function wootArticleWriterSetup(props) {
  let plugins = [
    history(),
    baseKeyMaps(props.schema),
    blocksInputRule(props.schema),
    textFormattingInputRules(props.schema),
    linksInputRules(props.schema),
    listInputRules(props.schema),
    dropCursor(),
    gapCursor(),
    Placeholder(props.placeholder),
    menuBar({
      floating: true,
      content: buildArticleEditorMenu(props.schema, props.onImageUpload)
        .fullMenu,
    }),
    new Plugin({
      props: {
        attributes: { class: 'ProseMirror-woot-style' },
      },
    }),
    ...(props.plugins || []),
  ];

  return plugins;
}

export function wootMessageWriterSetup(props) {
  let plugins = [
    ...(props.plugins || []),
    history(),
    baseKeyMaps(props.schema),
    blocksInputRule(props.schema),
    textFormattingInputRules(props.schema),
    linksInputRules(props.schema),
    listInputRules(props.schema),
    dropCursor(),
    gapCursor(),
    Placeholder(props.placeholder),
    menuBar({
      floating: true,
      content: buildMessageEditorMenu(props.schema).fullMenu,
    }),
    new Plugin({
      props: {
        attributes: { class: 'ProseMirror-woot-style' },
      },
    }),
  ];

  return plugins;
}
