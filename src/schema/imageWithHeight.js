/**
 * Image node spec extending prosemirror-markdown's base image with a `height`
 * attribute. Height is stored as a CSS-ready string (e.g. "24px") that matches
 * the value carried in the `cw_image_height` URL query param.
 *
 * @param {Schema} baseSchema - the prosemirror-markdown schema to extend
 */
export const imageWithHeight = baseSchema => {
  const baseImage = baseSchema.spec.nodes.get('image');

  return {
    ...baseImage,
    attrs: { ...baseImage.attrs, height: { default: null } },
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: dom => ({
          src: dom.getAttribute('src'),
          title: dom.getAttribute('title'),
          alt: dom.getAttribute('alt'),
          height: dom.style.height || null,
        }),
      },
    ],
    toDOM: node => {
      const attrs = { src: node.attrs.src, alt: node.attrs.alt };
      if (node.attrs.title) attrs.title = node.attrs.title;
      if (node.attrs.height) attrs.style = `height: ${node.attrs.height}`;
      return ['img', attrs];
    },
  };
};
