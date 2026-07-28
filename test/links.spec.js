import { describe, it, expect } from 'vitest';

import { isSafeUrl, normalizeUrl } from '../src/rules/links';

describe('isSafeUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com',
    'ftp://example.com/file',
    '/hc/user-guide/articles/getting-started',
    'mailto:help@example.com',
    'tel:+1234567890',
    '  https://example.com  ',
  ])('accepts %j', url => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '#faq',
    '../getting-started',
    '?locale=en',
  ])('rejects %j', url => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it.each([
    'javascript:alert(1)//\nhttps://example.com',
    'javascript:alert(1)//\r\n/hc/user-guide/articles/getting-started',
    'data:text/html,<script>alert(1)</script>\nhttps://example.com',
  ])('rejects newline-smuggled %j', url => {
    expect(isSafeUrl(url)).toBe(false);
    expect(new URL(url, 'https://app.example.com/').protocol).not.toBe('https:');
  });

  // Control characters browsers trim but String#trim does not: the allowlist
  // fails closed instead of matching the scheme that follows.
  it.each(['javascript:alert(1)', 'https://example.com'])(
    'rejects %j prefixed with a control character',
    url => {
      expect(isSafeUrl(String.fromCharCode(1) + url)).toBe(false);
    }
  );
});

describe('normalizeUrl', () => {
  it('keeps whitelisted urls untouched', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('returns an empty string for unlinkable input', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBe('');
  });

  it('keeps only the linkifiable part of a newline-smuggled url', () => {
    expect(normalizeUrl('javascript:alert(1)//\nhttps://example.com')).toBe(
      'https://example.com'
    );
  });
});
