import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { MessageMarkdownSerializer } from '../src/schema/markdown/messageSerializer';
import { MessageMarkdownTransformer } from '../src/schema/markdown/messageParser';
import { ArticleMarkdownSerializer } from '../src/schema/markdown/articleSerializer';
import { ArticleMarkdownTransformer } from '../src/schema/markdown/articleParser';
import { buildMessageSchema } from '../src/schema/schemaBuilder';
import { fullSchema } from '../src/schema/article';
import tableHeaderRowPlugin from '../src/plugins/tableHeaderRow';

const messageSchema = buildMessageSchema(['strong', 'em', 'code', 'link'], ['image', 'table']);

const buildTable = (schema, rows) => {
  const { table, table_row, paragraph } = schema.nodes;
  return table.create(
    null,
    rows.map(cells =>
      table_row.create(
        null,
        cells.map(([type, content]) => schema.nodes[type].create(null, paragraph.create(null, content)))
      )
    )
  );
};

describe('tables without a header row', () => {
  it.each([
    ['message', messageSchema, MessageMarkdownSerializer, MessageMarkdownTransformer],
    ['article', fullSchema, ArticleMarkdownSerializer, ArticleMarkdownTransformer],
  ])('%s: serializes a separator so the markdown stays a table', (_, schema, serializer, Transformer) => {
    const doc = schema.node('doc', null, [
      buildTable(schema, [
        [['table_cell', schema.text('a')], ['table_cell', schema.text('b')]],
        [['table_cell', schema.text('1')], ['table_cell', schema.text('2')]],
      ]),
    ]);
    const md = serializer.serialize(doc);
    expect(md).toBe('| a   | b   |\n| --- | --- |\n| 1   | 2   |\n');
    const back = new Transformer(schema).parse(md);
    expect(back.firstChild.type.name).toBe('table');
    expect(back.firstChild.firstChild.firstChild.type.name).toBe('table_header');
  });

  it('the header row plugin turns the first row into header cells', () => {
    const state = EditorState.create({
      schema: messageSchema,
      plugins: [tableHeaderRowPlugin(messageSchema)],
    });
    const pasted = buildTable(messageSchema, [
      [['table_cell', messageSchema.text('a')], ['table_cell', messageSchema.text('b')]],
      [['table_cell', messageSchema.text('1')], ['table_cell', messageSchema.text('2')]],
    ]);
    const next = state.apply(state.tr.replaceSelectionWith(pasted));
    const rows = [];
    next.doc.firstChild.forEach(row => rows.push([]) && row.forEach(cell => rows[rows.length - 1].push(cell.type.name)));
    expect(rows).toEqual([
      ['table_header', 'table_header'],
      ['table_cell', 'table_cell'],
    ]);
    expect(next.doc.textContent).toBe('ab12');
  });
});

describe('images inside table cells', () => {
  it('survive the markdown round-trip with their size', () => {
    const { image } = messageSchema.nodes;
    const doc = messageSchema.node('doc', null, [
      buildTable(messageSchema, [
        [['table_header', messageSchema.text('Pic')], ['table_header', messageSchema.text('Name')]],
        [
          ['table_cell', image.create({ src: 'https://x.test/a.png', alt: 'logo', width: '120px' })],
          ['table_cell', messageSchema.text('Acme')],
        ],
      ]),
    ]);
    const md = MessageMarkdownSerializer.serialize(doc);
    expect(md).toContain('| ![logo](https://x.test/a.png?cw_image_width=120px) | Acme |');
    const back = new MessageMarkdownTransformer(messageSchema).parse(md);
    const cell = back.firstChild.child(1).firstChild;
    expect(cell.textContent).toBe('');
    expect(cell.firstChild.firstChild.attrs).toMatchObject({ alt: 'logo', width: '120px' });
    expect(MessageMarkdownSerializer.serialize(back)).toBe(md);
  });

  it('skip in-flight blob previews like block images do', () => {
    const { image } = messageSchema.nodes;
    const doc = messageSchema.node('doc', null, [
      buildTable(messageSchema, [[['table_header', image.create({ src: 'blob:x' })]]]),
    ]);
    expect(MessageMarkdownSerializer.serialize(doc)).toBe('|     |\n| --- |\n');
  });
});

describe('lists inside article table cells', () => {
  const { table, table_row, table_header, table_cell, paragraph, bullet_list, ordered_list, list_item } = fullSchema.nodes;
  const text = (content, marks) => paragraph.create(null, fullSchema.text(content, marks));
  const item = (...blocks) => list_item.create(null, blocks);
  const docWithCell = (...blocks) =>
    fullSchema.node('doc', null, [
      table.create(null, [
        table_row.create(null, [table_header.create(null, text('Header'))]),
        table_row.create(null, [table_cell.create(null, blocks)]),
      ]),
    ]);
  const transformer = new ArticleMarkdownTransformer(fullSchema);
  const bodyCell = doc => doc.firstChild.child(1).firstChild;

  it('keeps a list, with its nesting and formatting, through the markdown round-trip', () => {
    const bold = [fullSchema.marks.strong.create()];
    const doc = docWithCell(
      text('List:'),
      bullet_list.create(null, [
        item(text('Test 1')),
        item(text('Test 2', bold), ordered_list.create(null, [item(text('tt'))])),
      ])
    );
    const md = ArticleMarkdownSerializer.serialize(doc);
    expect(md).toContain('| List: <ul><li>Test 1</li><li>**Test 2** <ol><li>tt</li></ol></li></ul> |');
    const back = transformer.parse(md);
    expect(back.toJSON()).toEqual(doc.toJSON());
    expect(ArticleMarkdownSerializer.serialize(back)).toBe(md);
  });

  it.each([
    ['in a code span', '`<ul><li>a</li></ul>`'],
    ['left open', '<ul><li>a</li>'],
  ])('leaves list tags %s as text', (_, cellMarkdown) => {
    const cell = bodyCell(transformer.parse(`| Header |\n| --- |\n| ${cellMarkdown} |\n`));
    expect(cell.childCount).toBe(1);
    expect(cell.firstChild.type.name).toBe('paragraph');
    expect(cell.textContent).toContain('<li>a</li>');
  });

  it.each([
    ['in a cell', () => docWithCell(text('Example: <ul><li>Sample</li></ul>'))],
    ['in an item of a real list', () => docWithCell(bullet_list.create(null, [item(text('Use <li> for an item')), item(text('second'))]))],
  ])('keeps list tags typed %s as text', (_, buildDoc) => {
    const doc = buildDoc();
    const back = transformer.parse(ArticleMarkdownSerializer.serialize(doc));
    expect(back.toJSON()).toEqual(doc.toJSON());
  });

  it.each([
    ['at the end of an item', 'Set folder to C:\\'],
    ['before a typed list tag', 'Use \\<li> here'],
  ])('keeps a backslash typed %s', (_, itemText) => {
    const doc = docWithCell(bullet_list.create(null, [item(text(itemText)), item(text('second'))]));
    const back = transformer.parse(ArticleMarkdownSerializer.serialize(doc));
    expect(back.toJSON()).toEqual(doc.toJSON());
  });

  it('leaves list tags as text in message tables, whose cells only hold paragraphs', () => {
    const back = new MessageMarkdownTransformer(messageSchema).parse('| Header |\n| --- |\n| <ul><li>a</li></ul> |\n');
    expect(bodyCell(back).textContent).toBe('<ul><li>a</li></ul>');
    expect(MessageMarkdownSerializer.serialize(back)).toContain('| <ul><li>a</li></ul> |');
  });
});
