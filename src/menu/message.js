/* eslint-disable no-cond-assign */
/* eslint-disable no-plusplus */
import { MenuItem } from 'prosemirror-menu';
import { toggleMark } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { wrapInList } from 'prosemirror-schema-list';
import { openPrompt } from '../prompt';
import { TextField } from '../TextField';
import { markActive } from '../utils';
import {
  BoldIcon,
  ItalicsIcon,
  CodeIcon,
  UndoIcon,
  RedoIcon,
  LinkIcon,
  TextNumberListIcon,
  BulletListIcon,
} from '../icons.js';

// Helpers to create specific types of items

function cmdItem(cmd, options) {
  let passedOptions = {
    label: options.title,
    run: cmd,
  };
  Object.keys(options).reduce((acc, optionKey) => {
    acc[optionKey] = options[optionKey];
    return acc;
  }, passedOptions);
  if ((!options.enable || options.enable === true) && !options.select)
    passedOptions[options.enable ? 'enable' : 'select'] = state => cmd(state);

  return new MenuItem(passedOptions);
}

function markItem(markType, options) {
  let passedOptions = {
    active(state) {
      return markActive(state, markType);
    },
    enable: true,
  };
  Object.keys(options).reduce((acc, optionKey) => {
    acc[optionKey] = options[optionKey];
    return acc;
  }, passedOptions);
  return cmdItem(toggleMark(markType), passedOptions);
}

function linkItem(markType) {
  return new MenuItem({
    title: 'Add or remove link',
    icon: LinkIcon,
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
        title: 'Create a link',
        fields: {
          href: new TextField({
            label: 'https://example.com',
            class: 'small',
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
}

function wrapListItem(nodeType, options) {
  return cmdItem(wrapInList(nodeType, options.attrs), options);
}

export function buildMessageEditorMenu(schema) {
  let r = {
    toggleStrong: markItem(schema.marks.strong, {
      title: 'Toggle strong style',
      icon: BoldIcon,
    }),
    toggleEm: markItem(schema.marks.em, {
      title: 'Toggle emphasis',
      icon: ItalicsIcon,
    }),
    toggleCode: markItem(schema.marks.code, {
      title: 'Toggle code font',
      icon: CodeIcon,
    }),
    toggleLink: linkItem(schema.marks.link),
    wrapBulletList: wrapListItem(schema.nodes.bullet_list, {
      title: 'Wrap in bullet list',
      icon: BulletListIcon,
    }),
    wrapOrderedList: wrapListItem(schema.nodes.ordered_list, {
      title: 'Wrap in ordered list',
      icon: TextNumberListIcon,
    }),
    undoItem: new MenuItem({
      title: 'Undo last change',
      run: undo,
      enable: state => undo(state),
      icon: UndoIcon,
    }),
    redoItem: new MenuItem({
      title: 'Redo last undone change',
      run: redo,
      enable: state => redo(state),
      icon: RedoIcon,
    }),
  };

  let cut = arr => arr.filter(x => x);

  r.inlineMenu = [
    cut([r.toggleStrong, r.toggleEm, r.toggleCode, r.toggleLink]),
  ];
  r.blockMenu = [cut([r.wrapBulletList, r.wrapOrderedList])];
  r.fullMenu = r.inlineMenu.concat([[r.undoItem, r.redoItem]], r.blockMenu);

  return r;
}
