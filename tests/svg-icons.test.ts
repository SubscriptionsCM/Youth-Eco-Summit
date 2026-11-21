// @vitest-environment happy-dom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from '../src/components/icon';
import { iconPaths, withSvgIcons, type IconName } from '../src/components/icon-shapes';
import reference from '../src/data/live-presentation.json';
import winners from '../src/data/live-winners.json';

const iconGlyph = /[\u2190-\u2193\u2197\u2304\u25b6\u2161\u2713\u2733\ufe0f]/u;
function parse(html: string) {
  const template = document.createElement('template'); template.innerHTML = html;
  return template.content;
}

describe('font-independent decorative icons', () => {
  it('renders every React icon with path geometry and no focus or spoken text', () => {
    for (const name of Object.keys(iconPaths) as IconName[]) {
      const root = parse(renderToStaticMarkup(React.createElement('a', { href: '/competitions' }, 'Explore competitions ', React.createElement(Icon, { name }))));
      const link = root.querySelector('a')!, svg = link.querySelector('svg')!;
      expect(link.textContent).toBe('Explore competitions ');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      expect(svg.getAttribute('width')).toBe('1em');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.querySelector('path')?.getAttribute('d')).toBe(iconPaths[name]);
      expect(svg.querySelector('text')).toBeNull();
    }
  });

  it('converts every live page and replacement winner panel before display, preserving control labels', () => {
    const html = [...Object.values(reference.pages).map(page => page.html), ...Object.values(winners.panels)];
    for (const source of html) {
      const original = parse(source), converted = withSvgIcons(source), root = parse(converted);
      expect(root.textContent).not.toMatch(iconGlyph);
      expect(root.textContent).toBe(original.textContent?.replace(new RegExp(iconGlyph, 'gu'), ''));
      expect([...root.querySelectorAll('button[aria-label]')].map(button => button.getAttribute('aria-label'))).toEqual([...original.querySelectorAll('button[aria-label]')].map(button => button.getAttribute('aria-label')));
      for (const icon of root.querySelectorAll('.site-icon')) {
        expect(icon.tagName.toLowerCase()).toBe('svg');
        expect(icon.getAttribute('aria-hidden')).toBe('true');
        expect(icon.getAttribute('focusable')).toBe('false');
        expect(icon.querySelector('path')).not.toBeNull();
        expect(icon.querySelector('text')).toBeNull();
      }
      expect(withSvgIcons(converted)).toBe(converted);
    }
    const home = parse(withSvgIcons(reference.pages['/'].html));
    expect(home.querySelector('[aria-label="Next 2026 speakers"] svg path')).not.toBeNull();
    expect(home.querySelector('.hero-manifesto svg path')).not.toBeNull();
  });

  it('preserves ordinary Unicode copy and only replaces isolated, labelled decorative glyphs', () => {
    const copy = '<p>© 2027 – Youth Eco Summit · Asia’s students → next steps</p><span>→</span>';
    expect(withSvgIcons(copy)).toBe(copy);
    for (const label of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const ordinary = `<button aria-label="Ordinary action">${label}</button><span aria-hidden="true">${label}</span>`;
      expect(withSvgIcons(ordinary)).toBe(ordinary);
    }
    const result = parse(withSvgIcons('<span aria-hidden="true">↗️</span><button aria-label="Next winner">→</button>'));
    expect(result.querySelectorAll('svg path')).toHaveLength(2);
    expect(result.querySelector('button')?.getAttribute('aria-label')).toBe('Next winner');
  });
});
