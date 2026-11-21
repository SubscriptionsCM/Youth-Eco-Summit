import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SiteShell } from '../src/components/site-shell';
vi.mock('next/navigation', () => ({ usePathname: () => '/contact' }));
it('includes Contact Us in both public top navigation menus and marks the active desktop page', () => {
  const html = renderToStaticMarkup(createElement(SiteShell, { children: createElement('p', null, 'Contact page') }));
  const desktop = html.match(/<nav class="yes-desktop-nav"[^>]*>(.*?)<\/nav>/)?.[1] || '';
  const mobile = html.match(/<nav id="mobile-menu"[^>]*>(.*?)<\/nav>/)?.[1] || '';
  expect(desktop.match(/<a /g)).toHaveLength(5); expect(desktop).toMatch(/<a(?=[^>]*href="\/contact")(?=[^>]*aria-current="page")[^>]*>Contact Us<\/a>/);
  expect(mobile).toContain('href="/contact">Contact Us');
});

it('opens the public mobile navigation throughout the tablet collapse range', () => {
  const css = readFileSync('src/app/public-header-navigation.css', 'utf8');
  expect(css).toContain('@media(max-width:1100px)');
  expect(css).toContain('.yes-header:not(.workspace-site-header) .yes-mobile-nav:not([hidden]){display:grid}');
});
