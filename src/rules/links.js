import { inputRules } from 'prosemirror-inputrules';
import { createInputRule } from '../utils';
import LinkifyIt from 'linkify-it';

// This is a copy of the linkify-it regex, passing `undefined` for the schema
// will use the default regex.
export const linkify = new LinkifyIt(undefined, { fuzzyLink: false });
linkify.add('sourcetree:', 'http:');

const tlds =
  'app|biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф'.split(
    '|'
  );
const tlds2Char =
  'a[cdefgilmnoqrtuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrtuvwxyz]|n[acefgilopruz]|om|p[aefghkmnrtw]|qa|r[eosuw]|s[abcdegijklmnrtuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]';
tlds.push(tlds2Char);
linkify.tlds(tlds, false);

function createLinkInputRule(regexp) {
  // Plain typed text (eg, typing 'www.google.com') should convert to a hyperlink
  return createInputRule(regexp, (state, match, start, end) => {
    const { schema } = state;
    if (state.doc.rangeHasMark(start, end, schema.marks.link)) {
      return null;
    }
    const [link] = match;

    const url = normalizeUrl(link.url);
    const markType = schema.mark('link', { href: url });

    return state.tr
      .addMark(
        start - (link.input.length - link.lastIndex),
        end - (link.input.length - link.lastIndex),
        markType
      )
      .insertText(' ');
  });
}

export class LinkMatcher {
  exec(str) {
    if (str.endsWith(' ')) {
      const chunks = str.slice(0, str.length - 1).split(' ');
      const lastChunk = chunks[chunks.length - 1];
      const links = linkify.match(lastChunk);
      if (links && links.length > 0) {
        const lastLink = links[links.length - 1];
        lastLink.input = lastChunk;
        lastLink.length = lastLink.lastIndex - lastLink.index + 1;
        return [lastLink];
      }
    }
    return null;
  }
}

// Patterns must anchor to the start of the whole string: with the `m` flag a
// smuggled newline (`javascript:alert(1)//\nhttps://example.com`) matches on the
// second line while browsers still parse the URL as `javascript:`.
const whitelistedURLPatterns = [
  /^https?:\/\//i,
  /^ftps?:\/\//i,
  /^\//i,
  /^mailto:/i,
  /^skype:/i,
  /^callto:/i,
  /^facetime:/i,
  /^git:/i,
  /^irc6?:/i,
  /^news:/i,
  /^nntp:/i,
  /^feed:/i,
  /^cvs:/i,
  /^svn:/i,
  /^mvn:/i,
  /^ssh:/i,
  /^scp:\/\//i,
  /^sftp:\/\//i,
  /^itms:/i,
  /^notes:/i,
  /^hipchat:\/\//i,
  /^sourcetree:/i,
  /^urn:/i,
  /^tel:/i,
  /^xmpp:/i,
  /^telnet:/i,
  /^vnc:/i,
  /^rdp:/i,
  /^whatsapp:/i,
  /^slack:/i,
  /^sips?:/i,
  /^magnet:/i,
];

export const isSafeUrl = url => {
  return whitelistedURLPatterns.some(p => p.test(url.trim()) === true);
};

export function getLinkMatch(str) {
  const match = str && linkify.match(str);
  return match && match[0];
}

/**
 * Adds protocol to url if needed.
 */
export function normalizeUrl(url) {
  if (!url) {
    return '';
  }

  if (isSafeUrl(url)) {
    return url;
  }
  const match = getLinkMatch(url);
  return (match && match.url) || '';
}

export function linksInputRules(schema) {
  if (!schema.marks.link) {
    return;
  }

  const urlWithASpaceRule = createLinkInputRule(new LinkMatcher());

  // [something](link) should convert to a hyperlink
  const markdownLinkRule = createInputRule(
    /(^|[^!])\[(.*?)\]\((\S+)\)$/,
    (state, match, start, end) => {
      const { schema } = state;
      const [, prefix, linkText, linkUrl] = match;
      const url = normalizeUrl(linkUrl);
      const markType = schema.mark('link', { href: url });

      return state.tr.replaceWith(
        start + prefix.length,
        end,
        schema.text(linkText, [markType])
      );
    }
  );

  return inputRules({
    rules: [urlWithASpaceRule, markdownLinkRule],
  });
}
