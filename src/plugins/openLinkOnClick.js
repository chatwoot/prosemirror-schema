import { Plugin } from "prosemirror-state";

// Mac uses Cmd+Click to open links; Ctrl+Click is its context-menu gesture.
const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad|od)/.test(navigator.platform || "");

// Block script schemes; strip whitespace/controls that browsers ignore in the
// scheme. Relative/fragment hrefs (#faq, ../page) have none and pass through.
const isDangerousHref = href =>
  /^(javascript|data|vbscript):/i.test(String(href).replace(/[\x00-\x20]/g, ""));

// Opens links in a new tab on Cmd+Click (Mac) or Ctrl+Click (other platforms).
export const openLinkOnClick = () =>
  new Plugin({
    props: {
      handleClick(view, pos, event) {
        if (!(isMac() ? event.metaKey : event.ctrlKey)) return false;

        const { doc } = view.state;
        const node = doc.nodeAt(pos);
        const link =
          (node && node.marks.find(mark => mark.type.name === "link")) ||
          doc.resolve(pos).marks().find(mark => mark.type.name === "link");
        const href = link && link.attrs.href;
        if (!href || isDangerousHref(href)) return false;

        window.open(href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
  });
