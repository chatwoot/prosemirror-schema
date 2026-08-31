import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';

import { fileUploadPlugin, insertFileUploads } from '../src/plugins/uploads';
import { getUpload } from '../src/plugins/uploadState';
import { messageSchema } from '../src/schema/message';

// insertFileUploads only touches state/dispatch/isDestroyed, so a functional
// fake view keeps this headless — the widget's toDOM is lazy and never runs.
const makeView = plugin => {
  const view = {
    state: EditorState.create({ schema: messageSchema, plugins: [plugin] }),
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
