import { describe, it, expect } from 'vitest';

import { findEmbedHtml } from '../src/plugins/embedPreview';

// Mirrors the youtube entry from chatwoot's markdown_embeds.yml: the video id is
// captured as [^&/]+, which permits quotes and spaces.
const youtube = {
  regex: /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)(?<video_id>[^&/]+)/,
  template:
    '<iframe src="https://www.youtube-nocookie.com/embed/%{video_id}"></iframe>',
};
const embeds = [youtube];

describe('findEmbedHtml', () => {
  it('interpolates a clean capture without altering it', () => {
    const html = findEmbedHtml(embeds, 'https://youtube.com/watch?v=abc_123-XY');
    expect(html).toContain('embed/abc_123-XY"');
  });

  it('returns null when no embed matches', () => {
    expect(findEmbedHtml(embeds, 'https://example.com/not-a-video')).toBeNull();
  });

  it('escapes a capture that tries to break out of the src attribute', () => {
    const html = findEmbedHtml(
      embeds,
      'https://youtube.com/watch?v=safe" onload="window.x=1'
    );
    // The injected quote is escaped, so no real onload attribute is created.
    expect(html).toContain('safe&quot; onload=&quot;window.x=1');
    expect(html).not.toContain('safe" onload=');
  });

  it('escapes angle brackets in a capture', () => {
    const html = findEmbedHtml(embeds, 'https://youtube.com/watch?v=<script>');
    expect(html).toContain('embed/&lt;script&gt;"');
    expect(html).not.toContain('<script>');
  });
});
