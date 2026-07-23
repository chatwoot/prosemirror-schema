import { Plugin } from "prosemirror-state";

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
        if (!link || !link.attrs.href) return false;

        window.open(link.attrs.href, "_blank", "noopener noreferrer");
        return true;
      },
    },
  });
