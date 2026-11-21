/** Path geometry shared by React and the reviewed public HTML renderer. */
export const iconPaths = {
  'arrow-right': 'M4 12h16m-7-7 7 7-7 7',
  'arrow-left': 'M20 12H4m7-7-7 7 7 7',
  'arrow-up': 'M12 20V4m-7 7 7-7 7 7',
  'arrow-down': 'M12 4v16m-7-7 7 7 7-7',
  'arrow-up-right': 'M5 19 19 5M5 5h14v14',
  'chevron-down': 'm6 9 6 6 6-6',
  play: 'm8 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  check: 'm5 12 4 4L19 6',
  asterisk: 'M12 2v20M2 12h20M5 5l14 14M5 19 19 5',
} as const;
export type IconName = keyof typeof iconPaths;

/** Only fixed, trusted path data is inserted, never application or participant content. */
export function iconMarkup(name: IconName): string {
  return `<svg class="site-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="display:inline-block;flex-shrink:0;vertical-align:-.15em"><path d="${iconPaths[name]}"></path></svg>`;
}

const glyphIcons: Record<string, IconName> = {
  '\u2192': 'arrow-right', '\u2190': 'arrow-left', '\u2191': 'arrow-up',
  '\u2193': 'arrow-down', '\u2197': 'arrow-up-right', '\u2304': 'chevron-down',
  '\u25b6': 'play', '\u2161': 'pause', '\u2713': 'check', '\u2733': 'asterisk',
};

/** Preserve the versioned source snapshot; convert only explicitly decorative icon nodes. */
export function withSvgIcons(html: string): string {
  // Two reviewed CTA labels contain a trailing arrow without a decorative wrapper.
  const arrow = `<span aria-hidden="true">${iconMarkup('arrow-up-right')}</span>`;
  const withLinkArrows = html
    .replace(/(<a\b[^>]*\bclass=["'][^"']*\byes-button\b[^"']*["'][^>]*>)([^<>]*?)\s+\u2197[\ufe0e\ufe0f]?\s*(<\/a>)/g, (_, open: string, label: string, close: string) => `${open}${label} ${arrow}${close}`)
    .replace(/(<a\b[^>]*\bclass=["'][^"']*\bhero-school-link\b[^"']*["'][^>]*>[^<>]*<span>)([^<>]*?)\s+\u2197[\ufe0e\ufe0f]?\s*(<\/span>)/g, (_, open: string, label: string, close: string) => `${open}${label} ${arrow}${close}`);
  return withLinkArrows.replace(/<(span|i|b|button)\b([^>]*)>([^<>]+)<\/\1>/g, (node, tag: string, attributes: string, text: string) => {
    const glyph = text.trim().replace(/[\ufe0e\ufe0f]/g, '');
    const name = Object.hasOwn(glyphIcons, glyph) ? glyphIcons[glyph] : undefined;
    const decorative = /(?:^|\s)aria-hidden=["']true["']/.test(attributes);
    const labelledButton = tag === 'button' && /(?:^|\s)aria-label=["'][^"']+["']/.test(attributes);
    return name && (decorative || labelledButton) ? `<${tag}${attributes}>${iconMarkup(name)}</${tag}>` : node;
  });
}
