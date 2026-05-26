import { Plugin } from "prosemirror-state";

/**
 * Keeps every image on its own line — no text to its left or right.
 *
 * The image node is inline, so ProseMirror would otherwise let text share the
 * paragraph. After each change, this splits any paragraph that holds an image
 * alongside other content, so the image ends up alone in its own paragraph.
 * (Backspace-to-clear an image is handled in the keymap, not here.)
 */
export default function isolateImagesPlugin() {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some(tr => tr.docChanged)) return null;

      const splits = [];
      newState.doc.descendants((node, pos) => {
        if (node.type.name !== "paragraph" || node.childCount < 2) return;

        const contentStart = pos + 1;
        const contentEnd = pos + node.nodeSize - 1;

        node.forEach((child, offset) => {
          if (child.type.name !== "image") return;
          const imageStart = contentStart + offset;
          const imageEnd = imageStart + child.nodeSize;
          if (imageStart > contentStart) splits.push(imageStart);
          if (imageEnd < contentEnd) splits.push(imageEnd);
        });
      });

      if (!splits.length) return null;

      const tr = newState.tr;
      // Dedupe (adjacent images share a boundary) and apply from the end so
      // earlier positions stay valid.
      [...new Set(splits)].sort((a, b) => b - a).forEach(p => tr.split(p));
      return tr;
    },
  });
}
