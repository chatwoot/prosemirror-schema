import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
} from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { getUploadLabels } from "./uploadState";
import { buildResizeHandle } from "../nodeViews/cornerResize";

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

// Captures come straight from the URL and land inside attribute values —
// escape them, or a crafted id could break out and inject attributes.
const escapeHtml = value =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const renderTemplate = (template, captures) =>
  Object.entries(captures).reduce(
    (html, [name, value]) => html.replaceAll(`%{${name}}`, escapeHtml(value)),
    template
  );

const findEmbed = (embeds, url) => {
  for (const embed of embeds) {
    const match = url.match(embed.regex);
    if (match) {
      return {
        html: renderTemplate(embed.template, match.groups || {}),
        hideSource: Boolean(embed.hideSource),
      };
    }
  }
  return null;
};

export const findEmbedHtml = (embeds, url) => findEmbed(embeds, url)?.html ?? null;

const REMOVE_ICON_SVG = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 2.5 9.5 9.5"/><path d="M9.5 2.5 2.5 9.5"/></svg>`;

const MIN_EMBED_PX = 220;

const stripParams = (url, names) => {
  const at = url.indexOf("?");
  if (at === -1) return url;
  const kept = url
    .slice(at + 1)
    .split("&")
    .filter(part => part && !names.includes(part.split("=")[0]));
  return kept.length ? `${url.slice(0, at)}?${kept.join("&")}` : url.slice(0, at);
};

// The width param is presentation only; widget identity ignores it so a
// resize never remounts a playing video.
const stripEmbedParams = url => stripParams(url, ["cw_video_width"]);

const withWidthParam = (url, px) => {
  const base = stripParams(url, ["cw_video_width"]);
  return `${base}${base.includes("?") ? "&" : "?"}cw_video_width=${px}px`;
};

const embedWidth = url => {
  const match = url.match(/[?&]cw_video_width=(\d+)px(?:&|$)/);
  return match ? Number(match[1]) : null;
};

// Persist a resize by rewriting the hidden source link's href; the width param
// round-trips through markdown and the portal renderer sizes the embed from it.
const setSourceWidth = (view, pos, px) => {
  const source = view.state.doc.resolve(pos).nodeBefore;
  if (!source) return;
  const linkType = view.state.schema.marks.link;
  const start = pos - source.nodeSize + 1;
  const tr = view.state.tr;
  source.forEach((child, offset) => {
    const mark = child.marks.find(item => item.type === linkType);
    if (!mark) return;
    const from = start + offset;
    const to = from + child.nodeSize;
    tr.removeMark(from, to, linkType);
    tr.addMark(
      from,
      to,
      linkType.create({ ...mark.attrs, href: withWidthParam(mark.attrs.href, px) })
    );
  });
  if (tr.steps.length) view.dispatch(tr);
};

const deleteSourceBefore = (view, pos) => {
  const source = view.state.doc.resolve(pos).nodeBefore;
  if (!source) return;
  view.dispatch(view.state.tr.delete(pos - source.nodeSize, pos));
  view.focus();
};

// The hidden source line can't be clicked, so removable previews carry their
// own remove and resize controls; background clicks select the hidden source.
const decorateRemovablePreview = (wrapper, view, getPos) => {
  wrapper.classList.add("cw-embed-preview--removable");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "cw-embed-remove";
  remove.setAttribute("aria-label", getUploadLabels().remove);
  remove.innerHTML = REMOVE_ICON_SVG;
  remove.addEventListener("mousedown", event => {
    event.preventDefault();
    event.stopPropagation();
  });
  remove.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    deleteSourceBefore(view, getPos());
  });

  const resize = buildResizeHandle("Resize video", () => {
    const containerWidth =
      wrapper.parentElement?.clientWidth || view.dom.clientWidth;
    if (!containerWidth) return null;
    return {
      target: wrapper,
      containerWidth,
      minPx: MIN_EMBED_PX,
      onCommit: widthPx => setSourceWidth(view, getPos(), widthPx),
    };
  });

  wrapper.append(remove, resize);
  wrapper.addEventListener("mousedown", event => {
    if (event.target.closest("video, iframe, a, button")) return;
    const pos = getPos();
    const $pos = view.state.doc.resolve(pos);
    if (!$pos.nodeBefore) return;
    event.preventDefault();
    view.dispatch(
      view.state.tr.setSelection(
        NodeSelection.create(view.state.doc, pos - $pos.nodeBefore.nodeSize)
      )
    );
    view.focus();
  });
};

const buildEmbedWidget = (html, { selectSource = false, url = "" } = {}) => (view, getPos) => {
  const wrapper = document.createElement("div");
  wrapper.className = "cw-embed-preview";
  wrapper.contentEditable = "false";
  wrapper.innerHTML = html;
  const savedWidth = url && embedWidth(url);
  if (savedWidth) wrapper.style.width = `${savedWidth}px`;
  // innerHTML doesn't execute <script> tags — re-create them so they do.
  wrapper.querySelectorAll("script").forEach(stale => {
    const fresh = document.createElement("script");
    Array.from(stale.attributes).forEach(({ name, value }) =>
      fresh.setAttribute(name, value)
    );
    fresh.textContent = stale.textContent;
    stale.replaceWith(fresh);
  });
  if (selectSource) decorateRemovablePreview(wrapper, view, getPos);
  return wrapper;
};

const collectEmbeds = (doc, embeds) => {
  const items = [];
  doc.forEach((node, offset, index) => {
    const url = getLoneLinkUrl(node);
    if (!url) return;
    const embed = findEmbed(embeds, url);
    if (!embed) return;
    items.push({
      index,
      offset,
      nodeSize: node.nodeSize,
      url,
      key: stripEmbedParams(url),
      html: embed.html,
      hideSource: embed.hideSource,
    });
  });
  return items;
};

const buildSet = (doc, items) =>
  DecorationSet.create(
    doc,
    items.flatMap(item => {
      const widget = Decoration.widget(
        item.offset + item.nodeSize,
        buildEmbedWidget(item.html, { selectSource: item.hideSource, url: item.url }),
        { side: -1, key: `embed:${item.key}` }
      );
      if (!item.hideSource) return [widget];
      // The preview fully represents the content, so the raw source line
      // stays out of sight — matching the portal, which renders only the embed.
      return [
        widget,
        Decoration.node(item.offset, item.offset + item.nodeSize, {
          class: "cw-embed-source-hidden",
        }),
      ];
    })
  );

const signatureOf = items =>
  items.map(item => `${item.index}:${item.key}`).join("|");

// Backspace after a hidden-source embed removes the whole embed — otherwise
// it silently eats the invisible link text character by character.
const deleteEmbedBefore = (view, embeds) => {
  const { state } = view;
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if ($from.depth !== 1 || $from.parentOffset !== 0) return false;
  const index = $from.index(0);
  if (index === 0) return false;
  const before = state.doc.child(index - 1);
  const url = getLoneLinkUrl(before);
  if (!url) return false;
  if (!findEmbed(embeds, url)?.hideSource) return false;
  const end = $from.before();
  view.dispatch(state.tr.delete(end - before.nodeSize, end));
  return true;
};

const isHiddenSource = (node, embeds) => {
  if (!node) return false;
  const url = getLoneLinkUrl(node);
  return url ? Boolean(findEmbed(embeds, url)?.hideSource) : false;
};

const hiddenSourceAt = (doc, index, embeds) =>
  index >= 0 &&
  index < doc.childCount &&
  isHiddenSource(doc.child(index), embeds);

const blockStart = (doc, index) => {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
};

// Arrows treat an embed like a block: they step onto it (node selection,
// shown as a ring on the player), then past it. At the document's edge a
// paragraph is created so there is always a line above and below a video.
const arrowPastEmbed = (view, key, embeds) => {
  const forward = key === "ArrowRight" || key === "ArrowDown";
  const { selection, doc } = view.state;
  const { $from } = selection;
  const onEmbed =
    selection instanceof NodeSelection &&
    isHiddenSource(selection.node, embeds);

  if (!onEmbed) {
    if (!(selection instanceof TextSelection) || !selection.empty) return false;
    if ($from.depth !== 1) return false;
    const atEdge =
      key === "ArrowUp" || key === "ArrowDown"
        ? view.endOfTextblock(forward ? "down" : "up")
        : $from.parentOffset === (forward ? $from.parent.content.size : 0);
    const next = $from.index(0) + (forward ? 1 : -1);
    // A caret inside the invisible line itself always steps out.
    if (
      !isHiddenSource($from.parent, embeds) &&
      !(atEdge && hiddenSourceAt(doc, next, embeds))
    ) {
      return false;
    }
  }

  const target = $from.index(0) + (forward ? 1 : -1);
  const tr = view.state.tr;
  if (target < 0 || target >= doc.childCount) {
    const pos = target < 0 ? 0 : doc.content.size;
    tr.insert(pos, view.state.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  } else if (hiddenSourceAt(doc, target, embeds)) {
    tr.setSelection(NodeSelection.create(doc, blockStart(doc, target)));
  } else {
    const pos =
      blockStart(doc, target) +
      (forward ? 1 : doc.child(target).nodeSize - 1);
    tr.setSelection(Selection.near(tr.doc.resolve(pos), forward ? 1 : -1));
  }
  view.dispatch(tr.scrollIntoView());
  return true;
};

// Enter on a selected embed starts a fresh line under the player.
const insertParagraphBelowSelectedEmbed = (view, embeds) => {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection)) return false;
  if (!isHiddenSource(selection.node, embeds)) return false;
  const after = selection.$from.pos + selection.node.nodeSize;
  const tr = view.state.tr.insert(
    after,
    view.state.schema.nodes.paragraph.create()
  );
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  view.dispatch(tr.scrollIntoView());
  return true;
};

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
    // A doc ending with a hidden source line leaves no visible spot below the
    // player — keep a paragraph after it, like trailingParagraphPlugin does
    // for atoms.
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const { doc, schema } = newState;
      if (!isHiddenSource(doc.lastChild, embeds)) return null;
      return newState.tr.insert(
        doc.content.size,
        schema.nodes.paragraph.create()
      );
    },
    state: {
      init(_, { doc }) {
        const items = collectEmbeds(doc, embeds);
        return { set: buildSet(doc, items), signature: signatureOf(items), items };
      },
      apply(tr, old) {
        if (!tr.docChanged) return old;
        const items = collectEmbeds(tr.doc, embeds);
        const signature = signatureOf(items);
        if (signature === old.signature) {
          return { set: old.set.map(tr.mapping, tr.doc), signature, items };
        }
        return { set: buildSet(tr.doc, items), signature, items };
      },
    },
    // Back online, reload any player that died while the connection was down.
    // A failed <source> never sets `error` — it parks in NETWORK_NO_SOURCE.
    view(editorView) {
      const reloadFailedMedia = () => {
        editorView.dom
          .querySelectorAll(".cw-embed-preview video")
          .forEach(media => {
            if (
              media.error ||
              media.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
            ) {
              media.load();
            }
          });
      };
      window.addEventListener("online", reloadFailedMedia);
      return {
        // Widget identity ignores sizing params so a resize never remounts a
        // playing video — the trade-off is that undo/redo of a resize keeps
        // the old wrapper. Sync its width to the document instead.
        update(view) {
          const { items } = embedPreviewKey.getState(view.state);
          if (!items.length) return;
          view.dom
            .querySelectorAll(".cw-embed-preview")
            .forEach((el, index) => {
              const item = items[index];
              if (!item) return;
              const width = embedWidth(item.url);
              const target = width ? `${width}px` : "";
              if (el.style.width !== target) el.style.width = target;
            });
        },
        destroy: () => window.removeEventListener("online", reloadFailedMedia),
      };
    },
    props: {
      decorations(state) {
        return embedPreviewKey.getState(state).set;
      },
      handleKeyDown(view, event) {
        if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)
          return false;
        if (event.key === "Backspace") return deleteEmbedBefore(view, embeds);
        if (event.key.startsWith("Arrow"))
          return arrowPastEmbed(view, event.key, embeds);
        if (event.key !== "Enter") return false;
        if (insertParagraphBelowSelectedEmbed(view, embeds)) return true;
        return insertParagraphAfterEmbed(
          view.state,
          tr => view.dispatch(tr),
          embeds
        );
      },
    },
  });
}
