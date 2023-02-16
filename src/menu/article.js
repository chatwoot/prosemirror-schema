/* eslint-disable no-cond-assign */
/* eslint-disable no-plusplus */
import { MenuItem } from 'prosemirror-menu';
import { toggleMark, setBlockType } from 'prosemirror-commands';
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
  Heading3Icon,
  Heading2Icon,
  Heading1Icon,
  TextNumberListIcon,
  BulletListIcon,
  ImageUploadIcon,
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

function blockTypeIsActive(state, type, attrs) {
  const { $from } = state.selection;

  let wrapperDepth;
  let currentDepth = $from.depth;
  while (currentDepth > 0) {
    const currentNodeAtDepth = $from.node(currentDepth);

    const comparisonAttrs = {
      ...attrs,
    };
    if (currentNodeAtDepth.attrs.level) {
      comparisonAttrs.level = currentNodeAtDepth.attrs.level;
    }
    const isType = type.name === currentNodeAtDepth.type.name;
    const hasAttrs = Object.keys(attrs).reduce((prev, curr) => {
      if (attrs[curr] !== currentNodeAtDepth.attrs[curr]) {
        return false;
      }
      return prev;
    }, true);

    if (isType && hasAttrs) {
      wrapperDepth = currentDepth;
    }
    currentDepth -= 1;
  }

  // return wrapperDepth !== undefined;
  return wrapperDepth;
}

const toggleBlockType = (type, attrs) => (state, dispatch) => {
  const isActive = blockTypeIsActive(state, type, attrs);
  const newNodeType = isActive ? state.schema.nodes.paragraph : type;
  const setBlockFunction = setBlockType(newNodeType, attrs);
  return setBlockFunction(state, dispatch);
};

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

function headerItem(nodeType, options) {
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
}

function imageUploadItem(nodeType, onFileUpload) {
  return new MenuItem({
    title: 'Upload image',
    icon: ImageUploadIcon,
    enable() {
      return true;
    },
    run() {
      onFileUpload();
      return true;
    },
  });
}

function wrapListItem(nodeType, options) {
  return cmdItem(wrapInList(nodeType, options.attrs), options);
}

export function buildArticleEditorMenu(schema, onFileUpload) {
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
    toggleH1: headerItem(schema.nodes.heading, {
      level: 1,
      title: 'Toggle code font',
      icon: Heading1Icon,
    }),
    toggleH2: headerItem(schema.nodes.heading, {
      level: 2,
      title: 'Toggle code font',
      icon: Heading2Icon,
    }),
    toggleH3: headerItem(schema.nodes.heading, {
      level: 3,
      title: 'Toggle code font',
      icon: Heading3Icon,
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
    imageUploadItem: imageUploadItem(schema.nodes.image, onFileUpload),
  };

  let cut = arr => arr.filter(x => x);

  r.inlineMenu = [
    cut([r.toggleStrong, r.toggleEm, r.toggleCode, r.toggleLink]),
  ];
  r.blockMenu = [
    cut([
      r.toggleH1,
      r.toggleH2,
      r.toggleH3,
      r.wrapBulletList,
      r.wrapOrderedList,
      r.imageUploadItem,
    ]),
  ];
  r.fullMenu = r.inlineMenu.concat([[r.undoItem, r.redoItem]], r.blockMenu);

  return r;
}
