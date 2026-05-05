import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

const isTopLevelTextSelection = selection =>
  selection instanceof TextSelection &&
  selection.empty &&
  selection.$from.depth === 1;

const getLoneLinkUrl = paragraph => {
  if (paragraph.type.name !== "paragraph") return null;
  let url = null;
  for (let i = 0; i < paragraph.childCount; i += 1) {
    const child = paragraph.child(i);
    if (!child.isText) return null;
    const linkMark = child.marks.find(mark => mark.type.name === "link");
    if (linkMark) {
      if (url && url !== linkMark.attrs.href) return null;
      url = linkMark.attrs.href;
    } else if (child.text.trim() !== "") {
      return null;
    }
  }
  return url;
};

const renderTemplate = (template, captures) =>
  Object.entries(captures).reduce(
    (html, [name, value]) => html.replaceAll(`%{${name}}`, value),
    template
  );

const findEmbedHtml = (embeds, url) => {
  for (const { regex, template } of embeds) {
    const match = url.match(regex);
    if (match) return renderTemplate(template, match.groups || {});
  }
  return null;
};

const buildEmbedWidget = html => () => {
  const wrapper = document.createElement("div");
  wrapper.className = "cw-embed-preview";
  wrapper.contentEditable = "false";
  wrapper.innerHTML = html;
  // innerHTML doesn't execute <script> tags — re-create them so they do.
  wrapper.querySelectorAll("script").forEach(stale => {
    const fresh = document.createElement("script");
    Array.from(stale.attributes).forEach(({ name, value }) =>
      fresh.setAttribute(name, value)
    );
    fresh.textContent = stale.textContent;
    stale.replaceWith(fresh);
  });
  return wrapper;
};

const collectEmbeds = (doc, embeds) => {
  const items = [];
  doc.forEach((node, offset, index) => {
    const url = getLoneLinkUrl(node);
    if (!url) return;
    const html = findEmbedHtml(embeds, url);
    if (!html) return;
    items.push({ index, offset, nodeSize: node.nodeSize, url, html });
  });
  return items;
};

const buildSet = (doc, items) =>
  DecorationSet.create(
    doc,
    items.map(item =>
      Decoration.widget(
        item.offset + item.nodeSize,
        buildEmbedWidget(item.html),
        { side: -1, key: `embed:${item.url}` }
      )
    )
  );

const signatureOf = items =>
  items.map(item => `${item.index}:${item.url}`).join("|");

const insertParagraphAfterEmbed = (state, dispatch, embeds) => {
  if (!isTopLevelTextSelection(state.selection)) return false;
  const { schema } = state;
  const { $from } = state.selection;
  const paragraph = $from.parent;
  if (paragraph.type.name !== "paragraph") return false;
  if ($from.parentOffset !== paragraph.content.size) return false;
  const url = getLoneLinkUrl(paragraph);
  if (!url || !findEmbedHtml(embeds, url)) return false;
  if (dispatch) {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

export const embedPreviewKey = new PluginKey("embedPreview");

export default function embedPreviewPlugin(embeds = []) {
  return new Plugin({
    key: embedPreviewKey,
    state: {
      init(_, { doc }) {
        const items = collectEmbeds(doc, embeds);
        return { set: buildSet(doc, items), signature: signatureOf(items) };
      },
      apply(tr, old) {
        if (!tr.docChanged) return old;
        const items = collectEmbeds(tr.doc, embeds);
        const signature = signatureOf(items);
        if (signature === old.signature) {
          return { set: old.set.map(tr.mapping, tr.doc), signature };
        }
        return { set: buildSet(tr.doc, items), signature };
      },
    },
    props: {
      decorations(state) {
        return embedPreviewKey.getState(state).set;
      },
      handleKeyDown(view, event) {
        if (event.key !== "Enter") return false;
        if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)
          return false;
        return insertParagraphAfterEmbed(
          view.state,
          tr => view.dispatch(tr),
          embeds
        );
      },
    },
  });
}
