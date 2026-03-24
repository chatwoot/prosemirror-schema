import { Plugin } from "prosemirror-state";
import { Slice, Fragment } from "prosemirror-model";
import { linkify, normalizeUrl } from "../rules/links";

/**
 * Takes a slice of pasted content and returns a new slice with link
 * marks applied to any bare URLs found in text nodes.
 */
function linkifySlice(slice, schema) {
  const linkMarkType = schema.marks.link;
  if (!linkMarkType) return slice;

  const fragment = linkifyFragment(slice.content, schema, linkMarkType, null);
  return new Slice(fragment, slice.openStart, slice.openEnd);
}

/**
 * Recursively walks a fragment and applies link marks to bare URLs
 * in text nodes.
 */
function linkifyFragment(fragment, schema, linkMarkType, parentNode) {
  const nodes = [];

  fragment.forEach(node => {
    if (node.isText) {
      nodes.push(...linkifyTextNode(node, schema, linkMarkType, parentNode));
    } else if (node.content.size > 0) {
      nodes.push(node.copy(linkifyFragment(node.content, schema, linkMarkType, node)));
    } else {
      nodes.push(node);
    }
  });

  return Fragment.fromArray(nodes);
}

/**
 * Takes a text node and splits it into multiple nodes where bare URLs
 * get a link mark applied. Returns an array of nodes.
 */
function linkifyTextNode(node, schema, linkMarkType, parentNode) {
  if (parentNode && !parentNode.type.allowsMarkType(linkMarkType)) return [node];

  // Skip if already has a link mark
  if (linkMarkType.isInSet(node.marks)) return [node];

  const matches = linkify.match(node.text);
  if (!matches || matches.length === 0) return [node];

  const nodes = [];
  let lastIndex = 0;

  matches.forEach(match => {
    const url = normalizeUrl(match.url);
    if (!url) return;

    // Text before the URL
    if (match.index > lastIndex) {
      nodes.push(schema.text(node.text.slice(lastIndex, match.index), node.marks));
    }

    // The URL with link mark
    const linkMark = linkMarkType.create({ href: url });
    nodes.push(
      schema.text(
        node.text.slice(match.index, match.lastIndex),
        linkMark.addToSet(node.marks)
      )
    );

    lastIndex = match.lastIndex;
  });

  // Remaining text after last URL
  if (lastIndex < node.text.length) {
    nodes.push(schema.text(node.text.slice(lastIndex), node.marks));
  }

  return nodes;
}

/**
 * ProseMirror plugin that automatically converts bare URLs into
 * proper link marks in pasted content.
 *
 * Typed URLs are handled by the existing linksInputRules (on space).
 * This plugin covers the paste case where URLs would otherwise
 * remain as plain text.
 */
export function autoLinkURLs(schema) {
  if (!schema.marks.link) return null;

  return new Plugin({
    props: {
      transformPasted(slice) {
        return linkifySlice(slice, schema);
      },
    },
  });
}
