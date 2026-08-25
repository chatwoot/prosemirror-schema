const DEFAULT_LABELS = {
  uploading: "Uploading…",
  failed: "Upload failed",
  rateLimited: "Upload limit reached. Try again in a few minutes.",
  retry: "Retry",
  remove: "Remove",
  cancel: "Cancel upload",
};

const labels = { ...DEFAULT_LABELS };

export const setUploadLabels = (next = {}) => {
  Object.keys(DEFAULT_LABELS).forEach((key) => {
    if (next[key]) labels[key] = next[key];
  });
};

export const getUploadLabels = () => labels;

const uploads = new Map();
let uploadCounter = 0;

export const newUploadId = () => {
  uploadCounter += 1;
  return `pm-upload-${uploadCounter}`;
};

export const getUpload = (id) => uploads.get(id) || null;

// run/remove/abort closures let any surface drive an upload without knowing
// which pipeline owns it.
export const registerUpload = (id, data) => {
  uploads.set(id, {
    status: "uploading",
    progress: null,
    errorKind: null,
    listeners: new Set(),
    ...data,
  });
  return uploads.get(id);
};

export const patchUpload = (id, patch) => {
  const entry = uploads.get(id);
  if (!entry) return;
  Object.assign(entry, patch);
  entry.listeners.forEach((listener) => listener(entry));
};

export const subscribeUpload = (id, listener) => {
  const entry = uploads.get(id);
  if (!entry) return () => {};
  entry.listeners.add(listener);
  listener(entry);
  return () => entry.listeners.delete(listener);
};

// Object URLs are never revoked: undo/redo can resurface a node that still
// points at its blob preview.
export const releaseUpload = (id) => {
  uploads.delete(id);
};

export const retryUpload = (id) => {
  const entry = uploads.get(id);
  if (entry?.status === "error") entry.run();
};

export const removeUpload = (id) => {
  const entry = uploads.get(id);
  if (!entry) return;
  entry.abort?.();
  entry.remove?.();
  releaseUpload(id);
};

// For uploads whose placeholder is already gone: abort and forget.
export const abandonUpload = (id) => {
  const entry = uploads.get(id);
  if (!entry) return;
  entry.abort?.();
  releaseUpload(id);
};

// Bounded concurrency so a large paste doesn't fire dozens of parallel
// requests. Tasks must never reject.
const MAX_CONCURRENT_UPLOADS = 3;
let activeUploads = 0;
const uploadQueue = [];

const drainQueue = () => {
  while (activeUploads < MAX_CONCURRENT_UPLOADS && uploadQueue.length) {
    const task = uploadQueue.shift();
    activeUploads += 1;
    task().finally(() => {
      activeUploads -= 1;
      drainQueue();
    });
  }
};

// One attempt: queue the request, then land in complete(url) or the error
// state. An abort never surfaces as an error.
export const runUpload = (id, { progress = null, request, complete }) => {
  const controller = new AbortController();
  patchUpload(id, {
    status: "uploading",
    progress,
    errorKind: null,
    abort: () => controller.abort(),
  });
  uploadQueue.push(async () => {
    if (controller.signal.aborted) return;
    try {
      const url = await request(controller.signal);
      if (!url) throw new Error("Upload failed");
      await complete(url);
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorKind =
        error?.response?.status === 429 ? "rateLimited" : "failed";
      patchUpload(id, { status: "error", errorKind });
    }
  });
  drainQueue();
};

export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** index;
  const rounded =
    value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[index]}`;
};

// Warm the cache before a node swaps to its uploaded URL so the swap never
// flashes. Resolves on failure or timeout too — the swap must happen anyway.
export const preloadImage = (url, timeoutMs = 8000) =>
  new Promise((resolve) => {
    const img = new Image();
    if (typeof img.decode !== "function") {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeoutMs);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    img.src = url;
    img.decode().then(done, done);
  });
