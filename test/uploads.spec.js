import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';

import {
  fileUploadPlugin,
  hasActiveUploads,
  insertFileUploads,
  insertImageFiles,
} from '../src/plugins/uploads';
import { getUpload } from '../src/plugins/uploadState';
import { fullSchema } from '../src/schema/article';
import { messageSchema } from '../src/schema/message';

// The upload pipelines only touch state/dispatch/isDestroyed, so a functional
// fake view keeps this headless — the widget's toDOM is lazy and never runs.
const makeView = (plugin, schema = messageSchema) => {
  const view = {
    state: EditorState.create({ schema, plugins: [plugin] }),
    isDestroyed: false,
    dispatch(tr) {
      view.state = view.state.apply(tr);
    },
  };
  return view;
};

const settle = () => new Promise(resolve => setTimeout(resolve));

describe('insertFileUploads', () => {
  it('flushes a finished file when the upload ahead of it fails', async () => {
    const plugin = fileUploadPlugin();
    const view = makeView(plugin);
    const pending = new Map();
    const upload = file =>
      new Promise((resolve, reject) =>
        pending.set(file.name, { resolve, reject })
      );

    insertFileUploads(
      view,
      [
        { name: 'first.mp4', size: 1 },
        { name: 'second.mp4', size: 1 },
      ],
      { upload }
    );
    await settle();

    // The finished second file waits behind first to keep pick order.
    pending.get('second.mp4').resolve('https://cdn.example.com/second.mp4');
    await settle();
    expect(view.state.doc.textContent).not.toContain('second.mp4');

    pending.get('first.mp4').reject(new Error('boom'));
    await settle();
    expect(view.state.doc.textContent).toContain('second.mp4');

    // The failed card stays for retry/remove.
    const cards = plugin.getState(view.state).set.find();
    expect(cards).toHaveLength(1);
    expect(getUpload(cards[0].spec.uploadId).status).toBe('error');
  });
});

describe('insertImageFiles', () => {
  const decodes = [];
  class FakeImage {
    decode() {
      return new Promise(resolve => decodes.push(resolve));
    }
  }

  beforeEach(() => {
    decodes.length = 0;
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts a picked image as active while it is still decoding', async () => {
    const plugin = fileUploadPlugin();
    // The article schema declares the uploadId attr the image pipeline uses.
    const view = makeView(plugin, fullSchema);
    insertImageFiles(view, [{ name: 'pic.png', size: 1 }], {
      upload: () => new Promise(() => {}),
    });

    // No node or card exists yet — the insert anchor covers this window.
    expect(hasActiveUploads(view)).toBe(true);

    decodes[0]();
    await settle();
    const images = [];
    view.state.doc.descendants(node => {
      if (node.type.name === 'image') images.push(node);
    });
    expect(images).toHaveLength(1);
    expect(hasActiveUploads(view)).toBe(true);
  });
});
