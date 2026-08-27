const RESIZE_ICON_SVG = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6 V2 H6"/><path d="M12 8 V12 H8"/><path d="M2 2 L12 12"/></svg>`;

// Pointer capture keeps the drag alive across iframes and window exits — a
// lost mouseup would leave the drag armed. In RTL the handle sits bottom-left
// (inset-inline-end), so the X delta flips to keep outward drags growing the
// target.
const startCornerResize = (handle, event, { target, containerWidth, minPx, onCommit }) => {
  const xSign = getComputedStyle(target).direction === "rtl" ? -1 : 1;
  const startWidth = target.getBoundingClientRect().width;
  const startX = event.clientX;
  const startY = event.clientY;
  let widthPx = 0;

  const onMove = (e) => {
    const px = startWidth + xSign * (e.clientX - startX) + (e.clientY - startY);
    widthPx = Math.max(minPx, Math.min(containerWidth, Math.round(px)));
    target.style.width = `${widthPx}px`;
  };

  const finish = () => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    if (widthPx) onCommit(widthPx);
  };

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  // Synthetic pointer events have no active pointer to capture; the drag
  // still tracks while the cursor stays on the handle.
  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    /* noop */
  }
};

// Shared corner chip for images and embeds. `getOptions(event)` returns the
// drag options, or a falsy value to ignore the press.
export const buildResizeHandle = (label, getOptions) => {
  const handle = document.createElement("span");
  handle.className = "pm-resize-handle";
  handle.contentEditable = "false";
  handle.setAttribute("aria-label", label);
  handle.innerHTML = RESIZE_ICON_SVG;
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const options = getOptions(event);
    if (options) startCornerResize(handle, event, options);
  });
  return handle;
};
