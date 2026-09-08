import { MarkdownSerializer as MarkdownSerializerBase } from 'prosemirror-markdown';

import {
  mention,
  tools,
  blockquote,
  code_block,
  bullet_list,
  ordered_list,
  list_item,
  paragraph,
  image,
  hard_break,
  text,
  em,
  strike,
  strong,
  link,
  code,
} from './serializer';
import { splitTrailingBreaks } from './serializer';

// Normalizes the doc before serializing so every empty visual line reaches
// the node serializers in one canonical shape (see splitTrailingBreaks)
class NormalizingMarkdownSerializer extends MarkdownSerializerBase {
  serialize(content, options) {
    return super.serialize(splitTrailingBreaks(content), options);
  }
}

export const MessageMarkdownSerializer = new NormalizingMarkdownSerializer(
  {
    mention,
    blockquote,
    code_block,
    bullet_list,
    ordered_list,
    list_item,
    paragraph,
    image,
    hard_break,
    text,
    tools,
  },
  {
    em,
    strike,
    strong,
    link,
    code,
  }
);
