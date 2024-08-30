import { MarkdownSerializer as MarkdownSerializerBase } from 'prosemirror-markdown';

import {
  blockquote,
  code_block,
  heading,
  horizontal_rule,
  bullet_list,
  ordered_list,
  list_item,
  paragraph,
  image,
  hard_break,
  text,
  em,
  superscript,
  strike,
  strong,
  link,
  code,
  table,
  table_row,
  table_cell,
} from './serializer';

export const ArticleMarkdownSerializer = new MarkdownSerializerBase(
  {
    blockquote,
    code_block,
    heading,
    horizontal_rule,
    bullet_list,
    ordered_list,
    list_item,
    paragraph,
    image,
    hard_break,
    text,
    table,
    table_row,
    table_cell,
  },
  {
    em,
    superscript,
    strike,
    strong,
    link,
    code,
  }
);
