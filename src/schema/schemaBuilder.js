import { Schema } from 'prosemirror-model';
import { orderedList, bulletList, listItem } from 'prosemirror-schema-list';
import { schema as baseSchema } from 'prosemirror-markdown';

/**
 * Build a schema with only specified marks and nodes enabled
 * This controls keyboard shortcuts, paste, input rules, and menu
 * 
 * @param {Array<string>} enabledMarks - Array of mark names to allow
 * @param {Array<string>} enabledNodes - Array of node names to allow (e.g., ['bulletList', 'orderedList'])
 * @returns {Schema}
 */
export function buildMessageSchema(enabledMarks = ['strong', 'em', 'code', 'link'], enabledNodes = ['bulletList', 'orderedList']) {
  // Build marks string for nodes (space-separated mark names)
  const marksString = enabledMarks.length > 0 ? enabledMarks.join(' ') : '';
  
  // Check which nodes are enabled
  const hasBulletList = enabledNodes.includes('bulletList');
  const hasOrderedList = enabledNodes.includes('orderedList');
  const hasCodeBlock = enabledNodes.includes('codeBlock');
  const hasBlockquote = enabledNodes.includes('blockquote');

  // Define nodes - copy from messageSchema but with restricted marks
  const nodes = {
    doc: baseSchema.spec.nodes.get('doc'),
    paragraph: {
      ...baseSchema.spec.nodes.get('paragraph'),
      marks: marksString,
    },
    // Only add blockquote if enabled
    ...(hasBlockquote ? {
      blockquote: {
        ...baseSchema.spec.nodes.get('blockquote'),
        marks: marksString,
      },
    } : {}),
    // Only add code_block if enabled
    ...(hasCodeBlock ? {
      code_block: baseSchema.spec.nodes.get('code_block'),
    } : {}),
    text: baseSchema.spec.nodes.get('text'),
    hard_break: baseSchema.spec.nodes.get('hard_break'),
    image: {
      ...baseSchema.spec.nodes.get('image'),
      attrs: {
        ...baseSchema.spec.nodes.get('image').attrs,
        height: { default: null }
      },
      parseDOM: [{
        tag: 'img[src]',
        getAttrs: dom => ({
          src: dom.getAttribute('src'),
          title: dom.getAttribute('title'),
          alt: dom.getAttribute('alt'),
          height: parseInt(dom.style.height)
        })
      }],
      toDOM: node => {
        const attrs = {
          src: node.attrs.src,
          alt: node.attrs.alt,
          height: node.attrs.height
        };
        if (node.attrs.height) {
          attrs.style = `height: ${node.attrs.height}`;
        }
        return ["img", attrs];
      }
    },
    // Only add list nodes if enabled
    ...(hasOrderedList ? {
      ordered_list: Object.assign({}, orderedList, {
        content: 'list_item+',
        group: 'block',
      }),
    } : {}),
    ...(hasBulletList ? {
      bullet_list: Object.assign({}, bulletList, {
        content: 'list_item+',
        group: 'block',
      }),
    } : {}),
    // Only add list_item if at least one list type is enabled
    ...((hasBulletList || hasOrderedList) ? {
      list_item: Object.assign({}, listItem, {
        content: 'paragraph block*',
        marks: marksString,
      }),
    } : {}),
    mention: {
      attrs: { 
        userFullName: { default: '' }, 
        userId: { default: '' },
        mentionType: { default: 'user' }
      },
      group: 'inline',
      inline: true,
      selectable: true,
      draggable: true,
      atom: true,
      toDOM: node => [
        'span',
        {
          class: 'prosemirror-mention-node',
          'mention-user-id': node.attrs.userId,
          'mention-user-full-name': node.attrs.userFullName,
          'mention-type': node.attrs.mentionType,
        },
        `@${node.attrs.userFullName}`,
      ],
      parseDOM: [
        {
          tag: 'span[mention-user-id][mention-user-full-name]',
          getAttrs: dom => {
            const userId = dom.getAttribute('mention-user-id');
            const userFullName = dom.getAttribute('mention-user-full-name');
            const mentionType = dom.getAttribute('mention-type') || 'user';
            return { userId, userFullName, mentionType };
          },
        },
      ],
    },
    tools: {
      attrs: { id: { default: '' }, name: { default: '' } },
      group: 'inline',
      inline: true,
      selectable: true,
      draggable: true,
      atom: true,
      toDOM: node => [
        'span',
        {
          class: 'prosemirror-tools-node',
          'tool-id': node.attrs.id,
          'tool-name': node.attrs.name,
        },
        `@${node.attrs.name}`,
      ],
      parseDOM: [
        {
          tag: 'span[tool-id][tool-name]',
          getAttrs: dom => {
            const id = dom.getAttribute('tool-id');
            const name = dom.getAttribute('tool-name');
            return { id, name };
          },
        },
      ],
    },
  };

  // Build marks object - ONLY include enabled marks
  const marks = {};
  
  if (enabledMarks.includes('link')) {
    marks.link = baseSchema.spec.marks.get('link');
  }
  
  if (enabledMarks.includes('em')) {
    marks.em = baseSchema.spec.marks.get('em');
  }
  
  if (enabledMarks.includes('strong')) {
    marks.strong = baseSchema.spec.marks.get('strong');
  }
  
  if (enabledMarks.includes('code')) {
    marks.code = baseSchema.spec.marks.get('code');
  }
  
  if (enabledMarks.includes('strike')) {
    marks.strike = {
      parseDOM: [
        { tag: 's' },
        { tag: 'del' },
        { tag: 'strike' },
        {
          style: 'text-decoration',
          getAttrs: value => value === 'line-through',
        },
      ],
      toDOM: () => ['s', 0],
    };
  }

  return new Schema({ nodes, marks });
}

export default buildMessageSchema;
