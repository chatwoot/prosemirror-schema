import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { buildFileUploadCard } from "../nodeViews/uploadOverlay";
import {
  abandonUpload,
  getUpload,
  newUploadId,
  patchUpload,
  preloadImage,
  registerUpload,
  releaseUpload,
  removeUpload,
  runUpload,
  subscribeUpload,
} from "./uploadState";

// Insert a block node as close to $pos as the structure allows: before/after
// the textblock at its edges, or by splitting it mid-text (consuming an
// adjacent soft line break so no blank line is left). Never replaces the
// block at $pos — decorations anchored there must survive.
const insertBlockNear = (tr, $pos, node) => {
  if (!$pos.parent.isTextblock) return tr.insert($pos.pos, node);
  if ($pos.parentOffset === 0) return tr.insert($pos.before(), node);
  if ($pos.parentOffset === $pos.parent.content.size) {
    return tr.insert($pos.after(), node);
  }
  let pos = $pos.pos;
  if ($pos.nodeBefore?.type.name === "hard_break") {
    tr = tr.delete(pos - 1, pos);
    pos -= 1;
  } else if ($pos.nodeAfter?.type.name === "hard_break") {
    tr = tr.delete(pos, pos + 1);
  }
  return tr.split(pos).insert(pos + 1, node);
};

const fileRequest = (id, file, upload) => (signal) =>
  upload(file, (progress) => patchUpload(id, { progress }), signal);

// Apply only while the upload and the view are alive, then drop the entry.
const finishUpload = (view, id, apply) => {
  const entry = getUpload(id);
  if (entry && !view.isDestroyed) apply(entry);
  releaseUpload(id);
};

// --- Images: upload behind the visible node (blob preview or pasted external
// URL) and swap src in place; the uploadId attr ties node and upload.

const findImages = (doc, test) => {
  const matches = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "image" && test(node)) matches.push({ node, pos });
  });
  return matches;
};

// Fall back to the preview URL for copies that lost the uploadId attr.
const findUploadImages = (doc, id, objectUrl) =>
  findImages(
    doc,
    (node) =>
      node.attrs.uploadId === id || (objectUrl && node.attrs.src === objectUrl)
  );

// Delete bottom-up so earlier deletes don't shift later positions.
// Previews aren't real content: their deletion must not create a history
// step, or undo would revive an image whose upload no longer exists.
const deleteImages = (view, matches) => {
  if (!matches.length) return;
  const tr = view.state.tr;
  matches
    .sort((a, b) => b.pos - a.pos)
    .forEach(({ node, pos }) => tr.delete(pos, pos + node.nodeSize));
  view.dispatch(tr.setMeta("addToHistory", false));
};

export const deleteImagesBySrc = (view, src) =>
  deleteImages(
    view,
    findImages(view.state.doc, (node) => node.attrs.src === src)
  );

const deleteUploadImages = (view, id) => {
  const entry = getUpload(id);
  if (!entry || view.isDestroyed) return;
  deleteImages(view, findUploadImages(view.state.doc, id, entry.objectUrl));
};

// Mirroring enhances an already-valid image, and its tag can cover
// pre-existing duplicates of the pasted URL — so cancelling only clears the
// transient tag and keeps every image.
const clearImageUploadTags = (view, id) => {
  if (view.isDestroyed) return;
  const matches = findImages(
    view.state.doc,
    (node) => node.attrs.uploadId === id
  );
  if (!matches.length) return;
  const tr = view.state.tr;
  matches.forEach(({ node, pos }) => {
    tr.setNodeMarkup(pos, null, { ...node.attrs, uploadId: null });
  });
  view.dispatch(tr.setMeta("addToHistory", false));
};

const swapUploadedImages = (view, id, url) =>
  finishUpload(view, id, (entry) => {
    const matches = findUploadImages(view.state.doc, id, entry.objectUrl);
    if (!matches.length) return;
    const tr = view.state.tr;
    matches.forEach(({ node, pos }) => {
      tr.setNodeMarkup(pos, null, { ...node.attrs, src: url, uploadId: null });
    });
    // Async completion, not a user edit: keep it out of history so undo
    // can't resurrect the unserializable blob preview.
    view.dispatch(tr.setMeta("addToHistory", false));
  });

const runImageUpload = (view, id, request, progress = null) =>
  runUpload(id, {
    progress,
    request,
    complete: async (url) => {
      await preloadImage(url);
      swapUploadedImages(view, id, url);
    },
  });

const insertImageNode = (view, attrs, pos) => {
  const { state } = view;
  const image = state.schema.nodes.image.create(attrs);
  const paragraph = state.schema.nodes.paragraph.create(null, image);
  const tr = insertBlockNear(state.tr, state.doc.resolve(pos), paragraph);
  view.dispatch(tr.scrollIntoView());
};

// After a node view for an upload is destroyed: when no node for it remains,
// abort the request instead of letting it run for nothing.
export const reconcileImageUpload = (view, id) => {
  const entry = getUpload(id);
  if (!entry) return;
  const gone =
    view.isDestroyed ||
    !findUploadImages(view.state.doc, id, entry.objectUrl).length;
  if (gone) abandonUpload(id);
};

// Insert image files as instant blob previews that swap in place to the
// uploaded URL; failures keep the preview with retry/remove controls.
// `upload` is (file, onProgress, signal) => Promise<url>.
export const insertImageFiles = (view, files, { upload }) => {
  const queue = Array.from(files).map((file) => ({
    file,
    id: newUploadId(),
    objectUrl: URL.createObjectURL(file),
  }));
  queue.forEach(({ file, id, objectUrl }) => {
    registerUpload(id, {
      kind: "image",
      name: file.name,
      size: file.size,
      objectUrl,
      run: () => runImageUpload(view, id, fileRequest(id, file, upload), 0),
      remove: () => deleteUploadImages(view, id),
    });
  });
  // The caret can move while previews decode — anchor the insert point now.
  const anchor = addInsertAnchor(view);
  (async () => {
    // Decode before inserting so the first paint has real dimensions;
    // sequential so the nodes land in pick order.
    for (const { id, objectUrl } of queue) {
      await preloadImage(objectUrl, 3000);
      if (!getUpload(id)) continue;
      // A missing anchor means the document was rebuilt (e.g. an external
      // reset) while the preview decoded — the files no longer belong there.
      const pos = view.isDestroyed ? null : insertAnchorPos(view, anchor);
      if (pos === null) {
        releaseUpload(id);
        continue;
      }
      insertImageNode(view, { src: objectUrl, uploadId: id }, pos);
      getUpload(id).run();
    }
    dropInsertAnchor(view, anchor);
  })();
};

// Mirror pasted external image URLs into storage. Images stay visible while
// mirroring, duplicate URLs share one upload, and failures keep the image
// with retry/remove controls. `upload` is (url, signal) => Promise<newUrl>.
export const mirrorExternalImages = (view, urls, { upload }) => {
  if (view.isDestroyed) return;
  const unique = new Set(urls);
  const assignments = new Map();
  const tr = view.state.tr;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image") return;
    const src = node.attrs.src;
    if (!unique.has(src) || node.attrs.uploadId) return;
    let id = assignments.get(src);
    if (!id) {
      id = newUploadId();
      assignments.set(src, id);
    }
    tr.setNodeMarkup(pos, null, { ...node.attrs, uploadId: id });
  });
  if (!assignments.size) return;
  // Register before dispatching: node views read the registry synchronously
  // while the uploadId transaction applies.
  assignments.forEach((id, src) => {
    registerUpload(id, {
      kind: "image",
      run: () => runImageUpload(view, id, (signal) => upload(src, signal)),
      remove: () => clearImageUploadTags(view, id),
    });
  });
  view.dispatch(tr.setMeta("addToHistory", false));
  assignments.forEach((id) => getUpload(id).run());
};

// --- Videos: upload behind a widget-decoration progress card at the caret.
// The card lives outside the document, so a half-finished upload can never be
// autosaved; success inserts a paragraph linking the file name.

const fileUploadKey = new PluginKey("fileUpload");

// State holds the card decorations plus insert anchors: caret positions
// captured when files arrive, mapped through edits so a delayed insert lands
// where the user acted.
export const fileUploadPlugin = () =>
  new Plugin({
    key: fileUploadKey,
    state: {
      init: () => ({ set: DecorationSet.empty, anchors: new Map() }),
      apply(tr, value) {
        const meta = tr.getMeta(fileUploadKey) || {};
        let set = value.set.map(tr.mapping, tr.doc);
        if (meta.add) set = set.add(tr.doc, [meta.add]);
        if (meta.removeId) {
          set = set.remove(
            set.find(undefined, undefined, (s) => s.uploadId === meta.removeId)
          );
        }
        let anchors = value.anchors;
        if (anchors.size || meta.addAnchor) {
          anchors = new Map();
          value.anchors.forEach((pos, id) => anchors.set(id, tr.mapping.map(pos)));
          if (meta.addAnchor) anchors.set(meta.addAnchor.id, meta.addAnchor.pos);
          if (meta.dropAnchor) anchors.delete(meta.dropAnchor);
        }
        return { set, anchors };
      },
    },
    props: {
      decorations: (state) => fileUploadKey.getState(state).set,
      // The card is a decoration, not a node — Backspace at its anchor would
      // otherwise delete the doc content above the card.
      handleKeyDown(view, event) {
        const modified =
          event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;
        if (event.key !== "Backspace" || modified) return false;
        const { selection } = view.state;
        if (!selection.empty) return false;
        const hits = fileUploadKey
          .getState(view.state)
          .set.find(selection.from, selection.from);
        if (!hits.length) return false;
        removeUpload(hits[hits.length - 1].spec.uploadId);
        return true;
      },
    },
  });

const addInsertAnchor = (view) => {
  const id = newUploadId();
  view.dispatch(
    view.state.tr.setMeta(fileUploadKey, {
      addAnchor: { id, pos: view.state.selection.from },
    })
  );
  return id;
};

const insertAnchorPos = (view, id) =>
  fileUploadKey.getState(view.state)?.anchors.get(id) ?? null;

const dropInsertAnchor = (view, id) => {
  if (view.isDestroyed) return;
  view.dispatch(view.state.tr.setMeta(fileUploadKey, { dropAnchor: id }));
};

const findUploadWidget = (view, id) => {
  const found = fileUploadKey
    .getState(view.state)
    .set.find(undefined, undefined, (spec) => spec.uploadId === id);
  return found.length ? found[0] : null;
};

// True while any upload in this view is still in flight — a rebuild would
// destroy the placeholders and abort the requests. Failed uploads don't
// count: an explicit external reset (e.g. discarding a draft) must win, and
// the rebuild reconciles their leftovers away.
export const hasActiveUploads = (view) => {
  const state = fileUploadKey.getState(view.state);
  // Anchors exist while picked images decode, before their previews insert.
  if (state?.anchors.size) return true;
  const inFlight = (id) => getUpload(id)?.status === "uploading";
  const cards = state?.set.find() || [];
  if (cards.some((deco) => inFlight(deco.spec.uploadId))) return true;
  let found = false;
  view.state.doc.descendants((node) => {
    if (node.type.name === "image" && inFlight(node.attrs.uploadId)) {
      found = true;
    }
    return !found;
  });
  return found;
};

const removeUploadWidget = (view, id) => {
  if (view.isDestroyed) return;
  view.dispatch(view.state.tr.setMeta(fileUploadKey, { removeId: id }));
};

// The link lands where the card was shown (which can be mid-textblock).
const completeFileUpload = (view, id, url) =>
  finishUpload(view, id, (entry) => {
    const { state } = view;
    const widget = findUploadWidget(view, id);
    let tr = state.tr;
    if (widget) {
      const mark = state.schema.marks.link.create({ href: url });
      const paragraph = state.schema.nodes.paragraph.create(
        null,
        state.schema.text(entry.name || url, [mark])
      );
      tr = insertBlockNear(tr, state.doc.resolve(widget.from), paragraph);
    }
    view.dispatch(tr.setMeta(fileUploadKey, { removeId: id }));
  });

const reconcileFileUpload = (view, id) => {
  if (!getUpload(id)) return;
  if (view.isDestroyed || !findUploadWidget(view, id)) abandonUpload(id);
};

// Upload video files with an inline progress card at the caret; on success
// the card becomes a lone paragraph linking the file name to the uploaded URL
// (the mp4 embed matches the href, so a player renders in its place).
// Completions flush in selection order: a finished file waits while an
// earlier pick is still uploading, so multi-file uploads keep their order.
// `upload` is (file, onProgress, signal) => Promise<url>.
export const insertFileUploads = (view, files, { upload }) => {
  const batch = Array.from(files).map((file) => ({
    file,
    id: newUploadId(),
    url: null,
    inserted: false,
  }));
  const flush = () => {
    for (const item of batch) {
      if (item.inserted) continue;
      if (item.url) {
        item.inserted = true;
        completeFileUpload(view, item.id, item.url);
      } else if (getUpload(item.id)?.status === "uploading") {
        return;
      }
      // Failed or removed entries don't block the files behind them.
    }
  };
  batch.forEach(({ id, file }) => {
    registerUpload(id, {
      kind: "file",
      name: file.name,
      size: file.size,
      run: () =>
        runUpload(id, {
          progress: 0,
          request: fileRequest(id, file, upload),
          complete: (url) => {
            batch.find((item) => item.id === id).url = url;
            flush();
          },
        }),
      remove: () => removeUploadWidget(view, id),
    });
    // A failure unblocks the finished files queued behind it.
    subscribeUpload(id, ({ status }) => {
      if (status === "error") flush();
    });
    const widget = Decoration.widget(
      view.state.selection.from,
      () => buildFileUploadCard(id),
      {
        uploadId: id,
        key: id,
        side: -1,
        destroy: (dom) => {
          dom.pmUploadCleanup?.();
          queueMicrotask(() => {
            reconcileFileUpload(view, id);
            flush();
          });
        },
      }
    );
    view.dispatch(view.state.tr.setMeta(fileUploadKey, { add: widget }));
    getUpload(id).run();
  });
};
