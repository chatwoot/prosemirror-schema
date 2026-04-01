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
  table,
  table_row,
  table_cell,
  table_header,
  em,
  superscript,
  strike,
  strong,
  link,
  code,
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
    table_header,
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
