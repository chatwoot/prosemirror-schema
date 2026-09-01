import { getUpload } from '../plugins/uploadState';
import { reconcileImageUpload } from '../plugins/uploads';
import { buildImageUploadOverlay } from './uploadOverlay';
import { buildResizeHandle } from './cornerResize';

const MIN_PX = 100;

class ImageResizeView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('span');
    this.dom.className = 'pm-image-wrapper';
    this.img = document.createElement('img');
    this.handle = buildResizeHandle('Resize image', () => {
      // A pasted image can sit in an inline ancestor (e.g. a link) whose
      // clientWidth is 0; fall back to the editor width.
      const containerWidth =
        this.dom.parentElement?.clientWidth || this.view.dom.clientWidth;
      if (!containerWidth) return null;
      return {
        target: this.dom,
        containerWidth,
        minPx: MIN_PX,
        onCommit: widthPx => this.commitWidth(widthPx),
      };
    });
    this.dom.append(this.img, this.handle);

    this.uploadId = null;
    this.overlay = null;

    this.syncImg();
    this.syncUpload();
  }

  commitWidth(widthPx) {
    const pos = this.getPos();
    if (pos == null) return;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, null, {
        ...this.node.attrs,
        width: `${widthPx}px`,
      })
    );
  }

  syncImg() {
    const { src, alt, title, width } = this.node.attrs;
    this.img.src = src;
    this.img.alt = alt || '';
    this.img.title = title || '';
    this.dom.style.width = width || '';
  }

  syncUpload() {
    // Message-schema images have no uploadId attr — normalize to null.
    const id = this.node.attrs.uploadId || null;
    if (id === this.uploadId) return;
    this.teardownUpload();
    if (!id || !getUpload(id)) return;
    this.uploadId = id;
    this.overlay = buildImageUploadOverlay(id);
    this.dom.appendChild(this.overlay);
    this.dom.classList.add('pm-image-uploading');
    // External mirrors have no local preview to define the box, so they get a
    // reserved footprint; local blobs are decoded pre-insert and size exactly.
    this.dom.classList.toggle(
      'pm-image-uploading-external',
      !getUpload(id).objectUrl
    );
  }

  teardownUpload() {
    this.uploadId = null;
    this.dom.classList.remove('pm-image-uploading', 'pm-image-uploading-external');
    if (!this.overlay) return;
    const overlay = this.overlay;
    this.overlay = null;
    overlay.pmUploadCleanup();
    // Fade the overlay out instead of yanking it; the src swap underneath is
    // preloaded, so the reveal is seamless.
    overlay.classList.add('pm-upload-done');
    setTimeout(() => overlay.remove(), 200);
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.syncImg();
    this.syncUpload();
    return true;
  }

  selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }
  ignoreMutation() { return true; }
  stopEvent(event) {
    return (
      this.handle.contains(event.target) ||
      Boolean(this.overlay?.contains(event.target))
    );
  }
  destroy() {
    const { uploadId, view } = this;
    this.teardownUpload();
    if (uploadId) {
      queueMicrotask(() => reconcileImageUpload(view, uploadId));
    }
  }
}

export const imageResizeView = (node, view, getPos) =>
  new ImageResizeView(node, view, getPos);

export default imageResizeView;
