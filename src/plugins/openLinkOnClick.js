import { Plugin } from "prosemirror-state";
import { normalizeUrl } from "../rules/links";

// macOS opens links with Cmd+Click; Ctrl+Click is reserved for the OS
// secondary-click (context menu). Other platforms use Ctrl+Click.
const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad|od)/.test(navigator.platform || "");

/**
 * Opens links in a new tab on Cmd+Click (macOS) or Ctrl+Click (other platforms).
 * Plain click keeps the default behavior (placing the cursor for editing).
 */
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
        if (!link) return false;

        // Only open whitelisted schemes; blocks javascript:/data: hrefs that
        // pasted HTML can inject into a link mark.
        const href = normalizeUrl(link.attrs.href);
        if (!href) return false;

        window.open(href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
  });
