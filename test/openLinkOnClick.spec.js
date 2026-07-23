import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';

import { openLinkOnClick } from '../src/plugins/openLinkOnClick';
import { messageSchema } from '../src/schema/message';

const s = messageSchema;
const HREF = 'https://example.com/pricing/';

// doc: <p>go <a>here</a></p> — "go " spans pos 1-4, linked "here" spans 4-8
const doc = s.node('doc', null, [
  s.node('paragraph', null, [
    s.text('go '),
    s.text('here', [s.marks.link.create({ href: HREF })]),
  ]),
]);
const view = { state: EditorState.create({ doc }) };
const handleClick = openLinkOnClick().props.handleClick;

const stubPlatform = platform =>
  vi.stubGlobal('navigator', { platform });

describe('openLinkOnClick', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { open: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the link in a new tab on cmd+click (macOS)', () => {
    stubPlatform('MacIntel');
    const handled = handleClick(view, 5, { metaKey: true, ctrlKey: false });
    expect(handled).toBe(true);
    expect(window.open).toHaveBeenCalledWith(HREF, '_blank', 'noopener,noreferrer');
  });

  it('ignores ctrl+click on macOS (reserved for the context menu)', () => {
    stubPlatform('MacIntel');
    const handled = handleClick(view, 5, { metaKey: false, ctrlKey: true });
    expect(handled).toBe(false);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens the link on ctrl+click (Windows/Linux)', () => {
    stubPlatform('Win32');
    const handled = handleClick(view, 5, { metaKey: false, ctrlKey: true });
    expect(handled).toBe(true);
    expect(window.open).toHaveBeenCalledWith(HREF, '_blank', 'noopener,noreferrer');
  });

  it('does nothing on plain click', () => {
    stubPlatform('MacIntel');
    const handled = handleClick(view, 5, { metaKey: false, ctrlKey: false });
    expect(handled).toBe(false);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does nothing on cmd+click outside a link', () => {
    stubPlatform('MacIntel');
    const handled = handleClick(view, 2, { metaKey: true, ctrlKey: false });
    expect(handled).toBe(false);
    expect(window.open).not.toHaveBeenCalled();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
    'does not open unsafe href %s',
    unsafeHref => {
      stubPlatform('MacIntel');
      const unsafeDoc = s.node('doc', null, [
        s.node('paragraph', null, [
          s.text('x', [s.marks.link.create({ href: unsafeHref })]),
        ]),
      ]);
      const unsafeView = { state: EditorState.create({ doc: unsafeDoc }) };
      const handled = handleClick(unsafeView, 1, { metaKey: true, ctrlKey: false });
      expect(handled).toBe(false);
      expect(window.open).not.toHaveBeenCalled();
    }
  );
});
