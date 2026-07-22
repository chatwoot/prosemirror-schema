import { describe, it, expect } from 'vitest';

import { MessageMarkdownSerializer } from '../src/schema/markdown/messageSerializer';
import { ArticleMarkdownSerializer } from '../src/schema/markdown/articleSerializer';
import { messageSchema } from '../src/schema/message';
import { fullSchema } from '../src/schema/article';

const URL = 'https://example.com/pricing/';

// Message-schema builders
const doc = (...children) => messageSchema.node('doc', null, children);
const p = (...children) => messageSchema.node('paragraph', null, children);
const t = (text, marks) => messageSchema.text(text, marks);
const br = () => messageSchema.node('hard_break');
const mark = (name, attrs) => messageSchema.marks[name].create(attrs);
const serialize = node => MessageMarkdownSerializer.serialize(node);

// Article-schema builders
const aDoc = (...children) => fullSchema.node('doc', null, children);
const aP = (...children) => fullSchema.node('paragraph', null, children);
const aT = (text, marks) => fullSchema.text(text, marks);
const aSerialize = node => ArticleMarkdownSerializer.serialize(node);

describe('hard_break', () => {
  it('writes a backslash break when plain text follows', () => {
    expect(serialize(doc(p(t('line one'), br(), t('line two'))))).toBe(
      'line one\\\nline two'
    );
  });

  it.each(['- item', '* item', '+ item', '1. item', '1) item'])(
    'skips the backslash when the next line is the list "%s"',
    line => {
      expect(serialize(doc(p(t('intro'), br(), t(line))))).toBe(
        `intro\n${line}`
      );
    }
  );

  it.each(['> quoted', '# heading', '``` code', '---'])(
    'skips the backslash when the next line starts block syntax "%s"',
    line => {
      expect(serialize(doc(p(t('intro'), br(), t(line))))).toBe(
        `intro\n${line}`
      );
    }
  );

  it('skips the backslash when a linked URL follows a bullet marker', () => {
    const result = serialize(
      doc(p(t('Click here:'), br(), t('- '), t(URL, [mark('link', { href: URL })])))
    );
    expect(result).toBe(`Click here:\n- <${URL}>`);
  });

  it('skips the backslash when a linked URL follows an ordered marker', () => {
    const result = serialize(
      doc(p(t('Click here:'), br(), t('1. '), t(URL, [mark('link', { href: URL })])))
    );
    expect(result).toBe(`Click here:\n1. <${URL}>`);
  });

  it('skips the backslash when bold text follows a list marker', () => {
    const result = serialize(
      doc(p(t('note'), br(), t('- '), t('important', [mark('strong')])))
    );
    expect(result).toBe('note\n- **important**');
  });

  it('keeps the backslash for a mid-sentence link that is not a list', () => {
    const result = serialize(
      doc(p(t('see'), br(), t('this '), t(URL, [mark('link', { href: URL })])))
    );
    expect(result).toBe(`see\\\nthis <${URL}>`);
  });

  it('writes a plain newline for a trailing hard break', () => {
    expect(serialize(doc(p(t('hello'), br())))).toBe('hello\n');
  });

  it('writes backslash breaks for consecutive hard breaks before text', () => {
    expect(serialize(doc(p(t('a'), br(), br(), t('b'))))).toBe('a\\\n\\\nb');
  });

  it('skips whitespace-only text nodes when deciding', () => {
    const result = serialize(
      doc(p(t('a'), br(), t('  '), t('- '), t(URL, [mark('link', { href: URL })])))
    );
    expect(result).toBe(`a\n  - <${URL}>`);
  });

  it('skips the backslash when a mention follows a list marker', () => {
    const mention = messageSchema.node('mention', {
      userId: '1',
      userFullName: 'Jane Doe',
    });
    expect(serialize(doc(p(t('assignees:'), br(), t('- '), mention)))).toBe(
      'assignees:\n- [@Jane Doe](mention://user/1/Jane%20Doe)'
    );
  });

  it('skips the backslash when an inline image follows a list marker', () => {
    const img = messageSchema.node('image', { src: 'https://x.co/a.png' });
    expect(serialize(doc(p(t('shots:'), br(), t('- '), img)))).toBe(
      'shots:\n- ![](https://x.co/a.png)'
    );
  });

  it('writes a backslash break when a non-text node (mention) follows', () => {
    const mention = messageSchema.node('mention', {
      userId: '1',
      userFullName: 'Jane Doe',
    });
    expect(serialize(doc(p(t('ping'), br(), mention)))).toBe(
      'ping\\\n[@Jane Doe](mention://user/1/Jane%20Doe)'
    );
  });
});

describe('paragraph', () => {
  it('serializes a single empty paragraph to nothing', () => {
    expect(serialize(doc(p()))).toBe('');
  });

  it('preserves an empty line between paragraphs with a backslash', () => {
    expect(serialize(doc(p(t('a')), p(), p(t('b'))))).toBe('a\n\n\\\nb');
  });

  it('drops the backslash when the empty paragraph precedes a list', () => {
    const list = messageSchema.node('bullet_list', null, [
      messageSchema.node('list_item', null, [p(t('item'))]),
    ]);
    expect(serialize(doc(p(t('a')), p(), list))).toBe('a\n\n\n* item');
  });

  it('drops the backslash when the empty paragraph follows a list', () => {
    const list = messageSchema.node('bullet_list', null, [
      messageSchema.node('list_item', null, [p(t('item'))]),
    ]);
    expect(serialize(doc(list, p(), p(t('b'))))).toBe('* item\n\n\nb');
  });

  it('drops the backslash on a trailing empty paragraph', () => {
    expect(serialize(doc(p(t('a')), p()))).toBe('a\n\n\n');
  });

  it('treats a whitespace-only paragraph as empty', () => {
    expect(serialize(doc(p(t('a')), p(t('   ')), p(t('b'))))).toBe(
      'a\n\n\\\nb'
    );
  });
});

describe('hard break × paragraph combinations', () => {
  const li = (...children) => messageSchema.node('list_item', null, children);
  const ul = (...items) => messageSchema.node('bullet_list', null, items);
  const linkTo = href => mark('link', { href });
  const URL2 = 'https://example.com/docs/';

  it('c1: leading hard break before text', () => {
    expect(serialize(doc(p(br(), t('after'))))).toBe('\\\nafter');
  });

  it('c2: new paragraph starting with a hard break', () => {
    expect(serialize(doc(p(t('a')), p(br(), t('b'))))).toBe('a\n\n\\\nb');
  });

  it('c3: alternating breaks and paragraphs', () => {
    expect(
      serialize(doc(p(t('a'), br(), t('b')), p(t('c'), br(), t('d'))))
    ).toBe('a\\\nb\n\nc\\\nd');
  });

  it('c4: triple hard break between text', () => {
    expect(serialize(doc(p(t('a'), br(), br(), br(), t('b'))))).toBe(
      'a\\\n\\\n\\\nb'
    );
  });

  it('c5: two empty paragraphs between text', () => {
    expect(serialize(doc(p(t('a')), p(), p(), p(t('b'))))).toBe(
      'a\n\n\\\n\\\nb'
    );
  });

  it('c6: trailing break then new paragraph', () => {
    expect(serialize(doc(p(t('a'), br()), p(t('b'))))).toBe('a\n\nb');
  });

  it('c7: bare bullet marker line then new paragraph', () => {
    expect(serialize(doc(p(t('x'), br(), t('- ')), p(t('y'))))).toBe(
      'x\n- \n\ny'
    );
  });

  it('c8: hard break inside a list item', () => {
    const list = ul(
      li(p(t('first item'), br(), t('continuation line'))),
      li(p(t('second item')))
    );
    expect(serialize(doc(list))).toBe(
      '* first item\\\n  continuation line\n\n* second item'
    );
  });

  it('c9: trailing bare numbered marker after break', () => {
    expect(serialize(doc(p(t('a'), br(), t('1. '))))).toBe('a\n1. ');
  });

  it('c10: two link-list lines chained by breaks', () => {
    const result = serialize(
      doc(
        p(
          t('a'),
          br(),
          t('- '),
          t(URL, [linkTo(URL)]),
          br(),
          t('- '),
          t(URL2, [linkTo(URL2)])
        )
      )
    );
    expect(result).toBe(`a\n- <${URL}>\n- <${URL2}>`);
  });

  it('c11: link lists across paragraphs', () => {
    const result = serialize(
      doc(
        p(t('a'), br(), t('- '), t(URL, [linkTo(URL)])),
        p(t('b'), br(), t('1. '), t(URL2, [linkTo(URL2)]))
      )
    );
    expect(result).toBe(`a\n- <${URL}>\n\nb\n1. <${URL2}>`);
  });

  it('c12: url on first line then break then text', () => {
    expect(
      serialize(doc(p(t(URL, [linkTo(URL)]), br(), t('text after'))))
    ).toBe(`<${URL}>\\\ntext after`);
  });

  it('c13: trailing break after a link', () => {
    expect(serialize(doc(p(t('check '), t(URL, [linkTo(URL)]), br())))).toBe(
      `check <${URL}>\n`
    );
  });

  it('c14: soft pair, blank paragraph, soft pair', () => {
    expect(
      serialize(
        doc(p(t('a'), br(), t('b')), p(), p(t('c'), br(), t('d')))
      )
    ).toBe('a\\\nb\n\n\\\nc\\\nd');
  });

  it('c15: hard break inside bold text', () => {
    const strong = mark('strong');
    const boldBreak = messageSchema.node('hard_break', null, null, [strong]);
    expect(
      serialize(doc(p(t('bold1', [strong]), boldBreak, t('bold2', [strong]))))
    ).toBe('**bold1\\\nbold2**');
  });

  it('c16: thematic break syntax after a hard break', () => {
    expect(serialize(doc(p(t('a'), br(), t('--- '))))).toBe('a\n--- ');
  });

  it('c17: heading syntax after a hard break', () => {
    expect(serialize(doc(p(t('a'), br(), t('# heading line'))))).toBe(
      'a\n# heading line'
    );
  });

  it('c18: table row syntax after a hard break', () => {
    expect(serialize(doc(p(t('a'), br(), t('| col |'))))).toBe('a\n| col |');
  });

  it('c19: whitespace-only text node between two breaks', () => {
    expect(serialize(doc(p(t('a'), br(), t('   '), br(), t('b'))))).toBe(
      'a\\\n   \\\nb'
    );
  });

  it('c20: empty paragraph then paragraph starting with break', () => {
    expect(serialize(doc(p(t('a')), p(), p(br(), t('end'))))).toBe(
      'a\n\n\\\n\\\nend'
    );
  });
});

describe('inline marks', () => {
  it('serializes strong, em, strike and code', () => {
    expect(serialize(doc(p(t('bold', [mark('strong')]))))).toBe('**bold**');
    expect(serialize(doc(p(t('italic', [mark('em')]))))).toBe('*italic*');
    expect(serialize(doc(p(t('gone', [mark('strike')]))))).toBe('~~gone~~');
    expect(serialize(doc(p(t('x = 1', [mark('code')]))))).toBe('`x = 1`');
  });

  it('extends the code fence around embedded backticks', () => {
    expect(serialize(doc(p(t('a`b', [mark('code')]))))).toBe('`` a`b ``');
  });
});

describe('link mark', () => {
  it('serializes a bare URL as an autolink', () => {
    expect(serialize(doc(p(t(URL, [mark('link', { href: URL })]))))).toBe(
      `<${URL}>`
    );
  });

  it('serializes a labelled link in bracket form', () => {
    expect(
      serialize(doc(p(t('pricing', [mark('link', { href: URL })]))))
    ).toBe(`[pricing](${URL})`);
  });

  it('percent-encodes whitespace in the href', () => {
    const href = 'https://example.com/a b';
    expect(serialize(doc(p(t('doc', [mark('link', { href })]))))).toBe(
      '[doc](https://example.com/a%20b)'
    );
  });

  it('escapes parentheses in the href', () => {
    const href = 'https://example.com/a(1)';
    expect(serialize(doc(p(t('doc', [mark('link', { href })]))))).toBe(
      '[doc](https://example.com/a\\(1\\))'
    );
  });
});

describe('mention and tools nodes', () => {
  it('serializes a mention as a mention:// link', () => {
    const mention = messageSchema.node('mention', {
      userId: '42',
      userFullName: 'John Smith',
      mentionType: 'team',
    });
    expect(serialize(doc(p(mention)))).toBe(
      '[@John Smith](mention://team/42/John%20Smith)'
    );
  });

  it('serializes a tool as a tool:// link', () => {
    const tool = messageSchema.node('tools', { id: 'search', name: 'Search' });
    expect(serialize(doc(p(tool)))).toBe('[@Search](tool://search)');
  });
});

describe('image node', () => {
  const img = attrs => messageSchema.node('image', attrs);

  it('serializes a plain image', () => {
    expect(serialize(doc(p(img({ src: 'https://x.co/a.png' }))))).toBe(
      '![](https://x.co/a.png)'
    );
  });

  it('appends cw_image_height and cw_image_width params', () => {
    expect(
      serialize(doc(p(img({ src: 'https://x.co/a.png', height: '120', width: '80' }))))
    ).toBe('![](https://x.co/a.png?cw_image_height=120&cw_image_width=80)');
  });

  it('appends sizing params to an existing query string', () => {
    expect(
      serialize(doc(p(img({ src: 'https://x.co/a.png?v=1', height: '120' }))))
    ).toBe('![](https://x.co/a.png?v=1&cw_image_height=120)');
  });

  it('replaces existing cw sizing params instead of duplicating them', () => {
    expect(
      serialize(
        doc(p(img({ src: 'https://x.co/a.png?cw_image_height=50', height: '120' })))
      )
    ).toBe('![](https://x.co/a.png?cw_image_height=120)');
  });
});

describe('block nodes', () => {
  it('serializes a bullet list', () => {
    const list = messageSchema.node('bullet_list', null, [
      messageSchema.node('list_item', null, [p(t('one'))]),
      messageSchema.node('list_item', null, [p(t('two'))]),
    ]);
    expect(serialize(doc(list))).toBe('* one\n\n* two');
  });

  it('serializes an ordered list honouring the start order', () => {
    const list = messageSchema.node('ordered_list', { order: 3 }, [
      messageSchema.node('list_item', null, [p(t('three'))]),
      messageSchema.node('list_item', null, [p(t('four'))]),
    ]);
    expect(serialize(doc(list))).toBe('3. three\n\n4. four');
  });

  it('serializes a blockquote', () => {
    const quote = messageSchema.node('blockquote', null, [p(t('wise words'))]);
    expect(serialize(doc(quote))).toBe('> wise words');
  });

  it('serializes a code block with language params', () => {
    const code = messageSchema.node('code_block', { params: 'js' }, [
      messageSchema.text('const a = 1;'),
    ]);
    expect(serialize(doc(code))).toBe('```js\nconst a = 1;\n```');
  });
});

describe('article serializer', () => {
  it('serializes headings by level', () => {
    const heading = fullSchema.node('heading', { level: 2 }, [aT('Title')]);
    expect(aSerialize(aDoc(heading))).toBe('## Title');
  });

  it('serializes a horizontal rule', () => {
    expect(aSerialize(aDoc(fullSchema.node('horizontal_rule')))).toBe('---');
  });

  it('serializes superscript', () => {
    const sup = fullSchema.marks.superscript.create();
    expect(aSerialize(aDoc(aP(aT('2'), aT('nd', [sup]))))).toBe('2^nd^');
  });

  const cell = (type, text, attrs = null, marks) =>
    fullSchema.node(type, attrs, [aP(aT(text, marks))]);
  const row = (...cells) => fullSchema.node('table_row', null, cells);

  it('serializes a table with header separator and padded columns', () => {
    const table = fullSchema.node('table', null, [
      row(cell('table_header', 'Name'), cell('table_header', 'Qty')),
      row(cell('table_cell', 'Apples'), cell('table_cell', '5')),
    ]);
    expect(aSerialize(aDoc(table))).toBe(
      '| Name   | Qty |\n' +
        '| ------ | --- |\n' +
        '| Apples | 5   |\n'
    );
  });

  it('persists column widths as a comment marker', () => {
    const table = fullSchema.node('table', null, [
      row(
        cell('table_header', 'A', { colwidth: [150] }),
        cell('table_header', 'B')
      ),
      row(cell('table_cell', 'x'), cell('table_cell', 'y')),
    ]);
    expect(aSerialize(aDoc(table))).toContain('<!--cw-colwidths:150,0-->\n');
  });

  it('escapes pipes inside cell text so re-parsing keeps the column count', () => {
    const table = fullSchema.node('table', null, [
      row(cell('table_header', 'A'), cell('table_header', 'B')),
      row(cell('table_cell', 'pipe a|b cell'), cell('table_cell', 'end cell')),
    ]);
    expect(aSerialize(aDoc(table))).toContain('pipe a\\|b cell');
  });

  it('round-trips a table with pipes, marks and links through parse → serialize', async () => {
    const { ArticleMarkdownTransformer } = await import(
      '../src/schema/markdown/articleParser'
    );
    const strong = fullSchema.marks.strong.create();
    const link = fullSchema.marks.link.create({ href: URL });
    const table = fullSchema.node('table', null, [
      row(cell('table_header', 'Name'), cell('table_header', 'Link')),
      row(cell('table_cell', 'pipe a|b cell'), cell('table_cell', 'x', null, [strong])),
      row(cell('table_cell', 'plain'), cell('table_cell', 'site', null, [link])),
    ]);
    const first = aSerialize(aDoc(table));
    const reparsed = new ArticleMarkdownTransformer(fullSchema).parse(first);
    const second = aSerialize(reparsed);
    expect(second).toBe(first);
  });

  it('preserves marks and links inside table cells', () => {
    const strong = fullSchema.marks.strong.create();
    const link = fullSchema.marks.link.create({ href: URL });
    const table = fullSchema.node('table', null, [
      row(cell('table_header', 'bold', null, [strong]), cell('table_header', 'link', null, [link])),
    ]);
    const result = aSerialize(aDoc(table));
    expect(result).toContain('**bold**');
    expect(result).toContain(`[link](${URL})`);
  });
});
