const MIN = 100;

// Diagonal-resize icon: two opposing corner brackets + connecting line.
const HANDLE_SVG = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6 V2 H6"/><path d="M12 8 V12 H8"/><path d="M2 2 L12 12"/></svg>`;

class ImageResizeView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('span');
    this.dom.className = 'pm-image-wrapper';

    this.img = document.createElement('img');
    this.dom.appendChild(this.img);

    this.handle = document.createElement('span');
    this.handle.className = 'pm-image-resize-handle';
    this.handle.contentEditable = 'false';
    this.handle.setAttribute('aria-label', 'Resize image');
    this.handle.innerHTML = HANDLE_SVG;
    this.handle.addEventListener('mousedown', this.onMouseDown);
    this.dom.appendChild(this.handle);

    this.syncImg();
  }

  syncImg() {
    const { src, alt, title, height } = this.node.attrs;
    this.img.src = src;
    this.img.alt = alt || '';
    this.img.title = title || '';
    this.img.style.height = height || '';
  }

  onMouseDown = event => {
    event.preventDefault();
    const startH = this.img.getBoundingClientRect().height || MIN;
    const startY = event.clientY;
    let moved = false;

    const onMove = e => {
      moved = true;
      this.img.style.height = `${Math.max(MIN, Math.round(startH + e.clientY - startY))}px`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved) return;
      const h = parseInt(this.img.style.height, 10);
      const pos = this.getPos();
      if (!Number.isFinite(h) || pos == null) return;
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, height: `${h}px` })
      );
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.syncImg();
    return true;
  }

  selectNode() { this.dom.classList.add('ProseMirror-selectednode'); }
  deselectNode() { this.dom.classList.remove('ProseMirror-selectednode'); }
  ignoreMutation() { return true; }
  stopEvent(event) { return this.handle.contains(event.target); }
  destroy() { this.handle.removeEventListener('mousedown', this.onMouseDown); }
}

export const imageResizeView = (node, view, getPos) =>
  new ImageResizeView(node, view, getPos);

export default imageResizeView;
