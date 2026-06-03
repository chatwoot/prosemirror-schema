import { EditorState, Plugin } from "prosemirror-state";

/**
 * Positions at which paragraphs must be split so that every image ends up alone
 * in its own paragraph (no text to its left or right). Returned deduped and
 * sorted descending so callers can apply them without remapping earlier
 * positions. (Adjacent images share a boundary, hence the dedupe.)
 *
 * @param {Node} doc - The ProseMirror document to inspect.
 * @returns {number[]} - Split positions, sorted high → low.
 */
function imageIsolationSplits(doc) {
  const splits = [];
  doc.descendants((node, pos) => {
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

  return [...new Set(splits)].sort((a, b) => b - a);
}

/**
 * Normalizes a document so every image sits alone in its own paragraph. Apply
 * at parse time so freshly parsed markdown matches the editor's runtime layout
 * (and therefore serializes back to identical markdown). Without this, a
 * parse → serialize round-trip keeps images inline while the live editor
 * isolates them, so the two outputs diverge.
 *
 * @param {Node} doc - The ProseMirror document to normalize.
 * @returns {Node} - The document with images isolated (unchanged if none apply).
 */
export function isolateImagesInDoc(doc) {
  const splits = imageIsolationSplits(doc);
  if (!splits.length) return doc;

  const { tr } = EditorState.create({ doc });
  splits.forEach(p => tr.split(p));
  return tr.doc;
}

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

      const splits = imageIsolationSplits(newState.doc);
      if (!splits.length) return null;

      const tr = newState.tr;
      splits.forEach(p => tr.split(p));
      return tr;
    },
  });
}
