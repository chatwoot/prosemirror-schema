import { Plugin } from "prosemirror-state";

import { deleteImagesBySrc, mirrorExternalImages } from "./uploads";

function isValidImageUrl(url) {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Own-origin images (earlier uploads copied between articles) need no
// mirroring — and the server rejects its own URLs anyway.
function isSameOrigin(url) {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

// Mirrors pasted external images into storage: images stay visible with an
// upload overlay while mirroring, duplicate URLs upload once, and a failed
// mirror keeps the image with retry/remove controls instead of deleting it.
// `uploadImage` is (url, signal) => Promise<newUrl>.
const imagePastePlugin = (uploadImage) =>
  new Plugin({
    props: {
      handlePaste(view, event, slice) {
        const external = [];
        const invalid = [];

        slice.content.descendants((node) => {
          if (node.type.name !== "image") return;
          const url = node.attrs.src;
          // blob: previews are this editor's own in-flight uploads being
          // copied around — leave them to their original upload.
          if (typeof url === "string" && url.startsWith("blob:")) return;
          if (isSameOrigin(url)) return;
          if (isValidImageUrl(url)) external.push(url);
          else invalid.push(url);
        });

        // Run after the paste has landed in the doc.
        setTimeout(() => {
          invalid.forEach((url) => deleteImagesBySrc(view, url));
          if (external.length) {
            mirrorExternalImages(view, external, { upload: uploadImage });
          }
        }, 0);
      },
    },
  });

export default imagePastePlugin;
