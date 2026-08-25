import {
  formatBytes,
  getUploadLabels,
  removeUpload,
  retryUpload,
  subscribeUpload,
} from "../plugins/uploadState";

const VIDEO_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.5 15 12l-5 2.5z" fill="currentColor" stroke="none"/></svg>`;
const CANCEL_ICON_SVG = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 2.5 9.5 9.5"/><path d="M9.5 2.5 2.5 9.5"/></svg>`;
const RETRY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
const TRASH_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

const el = (tag, className, props = {}) =>
  Object.assign(document.createElement(tag), { className, ...props });

const buildSpinner = () => {
  const spinner = el("span", "pm-upload-spinner");
  spinner.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 8; i += 1) {
    spinner.appendChild(document.createElement("span"));
  }
  return spinner;
};

const buildButton = (className, iconSvg, onClick) => {
  const button = el("button", className, {
    type: "button",
    innerHTML: iconSvg,
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  return button;
};

// Cancel while uploading; retry/remove after an error.
const buildControls = (id) => {
  const actions = el("span", "pm-upload-actions");
  const retry = buildButton("pm-upload-action", RETRY_ICON_SVG, () =>
    retryUpload(id)
  );
  const remove = buildButton("pm-upload-action", TRASH_ICON_SVG, () =>
    removeUpload(id)
  );
  actions.append(retry, remove);
  return {
    cancel: buildButton("pm-upload-cancel", CANCEL_ICON_SVG, () =>
      removeUpload(id)
    ),
    actions,
    retry,
    remove,
  };
};

const setLabel = (button, label) => {
  button.setAttribute("aria-label", label);
  button.title = label;
};

// Hold at 99% while the request is open — a full bar that just sits there
// reads worse than one pausing short.
const displayPercent = (progress) =>
  Math.min(99, Math.round(Math.max(0, Math.min(1, progress)) * 100));

// Middle truncation keeps the extension visible on long file names.
const displayName = (name) => {
  const value = name || "";
  return value.length <= 38 ? value : `${value.slice(0, 22)}…${value.slice(-12)}`;
};

const statusText = (entry, labels) => {
  if (entry.status === "error") {
    return entry.errorKind === "rateLimited"
      ? labels.rateLimited
      : labels.failed;
  }
  const parts = [labels.uploading];
  if (entry.progress != null) parts.push(`${displayPercent(entry.progress)}%`);
  const size = formatBytes(entry.size);
  if (size) parts.push(size);
  return parts.join(" · ");
};

const syncStatus = (dom, { cancel, retry, remove }, text, entry) => {
  const labels = getUploadLabels();
  dom.dataset.state = entry.status === "error" ? "error" : "uploading";
  setLabel(retry, labels.retry);
  setLabel(remove, labels.remove);
  setLabel(cancel, labels.cancel);
  text.textContent = statusText(entry, labels);
};

// Both builders return a self-subscribed element that keeps itself in sync
// with the upload; `pmUploadCleanup` unsubscribes.

// Scrim + status pill rendered over an image while it uploads.
export const buildImageUploadOverlay = (id) => {
  const dom = el("span", "pm-upload-overlay", { contentEditable: "false" });
  const pill = el("span", "pm-upload-pill");
  pill.setAttribute("role", "status");
  const status = el("span", "pm-upload-status");
  const text = el("span", "pm-upload-text");
  const controls = buildControls(id);
  status.append(buildSpinner(), text, controls.cancel);
  pill.append(status, controls.actions);
  dom.appendChild(pill);

  dom.pmUploadCleanup = subscribeUpload(id, (entry) =>
    syncStatus(dom, controls, text, entry)
  );
  return dom;
};

// Inline progress card for video uploads.
export const buildFileUploadCard = (id) => {
  const dom = el("span", "pm-upload-card", { contentEditable: "false" });
  const icon = el("span", "pm-upload-card-icon", { innerHTML: VIDEO_ICON_SVG });
  const name = el("span", "pm-upload-card-name");
  const meta = el("span", "pm-upload-card-meta");
  meta.setAttribute("role", "status");
  const text = el("span", "pm-upload-text");
  meta.append(buildSpinner(), text);
  const body = el("span", "pm-upload-card-body");
  body.append(name, meta);
  const controls = buildControls(id);
  dom.append(icon, body, controls.cancel, controls.actions);

  dom.pmUploadCleanup = subscribeUpload(id, (entry) => {
    syncStatus(dom, controls, text, entry);
    name.textContent = displayName(entry.name);
    name.title = entry.name || "";
  });
  return dom;
};
