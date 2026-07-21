import { Plugin } from "prosemirror-state";

/**
 * Opens links in a new tab on Cmd/Ctrl+Click.
 * Plain click keeps the default behavior (placing the cursor for editing).
 */
export const openLinkOnClick = () =>
  new Plugin({
    props: {
      handleClick(view, pos, event) {
        if (!event.metaKey && !event.ctrlKey) return false;

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
