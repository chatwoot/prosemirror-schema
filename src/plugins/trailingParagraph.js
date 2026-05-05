import { Plugin } from "prosemirror-state";

/**
 * Ensures the document always ends with a paragraph.
 *
 * Without this, blocks that don't yield a "next position" on their own
 * (tables, atomic block images, custom embeds, etc.) leave the user with no
 * place to land the caret below them. Mirrors the standard "trailing node"
 * pattern (e.g. Tiptap's TrailingNode extension).
 */
export default function trailingParagraphPlugin() {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const { doc, schema } = newState;
      const paragraphType = schema.nodes.paragraph;
      if (!paragraphType) return null;
      const last = doc.lastChild;
      if (!last || last.type === paragraphType) return null;
      return newState.tr.insert(doc.content.size, paragraphType.create());
    },
  });
}
