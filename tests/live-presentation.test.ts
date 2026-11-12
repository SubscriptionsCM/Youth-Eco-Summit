import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const dataFile = resolve('src/data/live-presentation.json');
describe('current live public presentation', () => {
  it('contains every public marketing route, excluding transactional pages', () => {
    expect(existsSync(dataFile)).toBe(true);
    const { pages } = JSON.parse(readFileSync(dataFile, 'utf8'));
    expect(Object.keys(pages).sort()).toEqual(['/', '/about', '/students', '/parents', '/teachers-schools', '/competitions', '/how-to-participate', '/awards', '/experience', '/partners', '/resources', '/showcase', '/faq', '/contact', '/get-involved'].sort());
  });
  it('contains reviewed static markup without source scripts, form actions or remote account state', () => {
    const { pages } = JSON.parse(readFileSync(dataFile, 'utf8'));
    for (const page of Object.values(pages) as { html: string }[]) {
      expect(page.html).not.toMatch(/<script\b|<form\b|<iframe\b|\son\w+\s*=|javascript:|YES_WORDPRESS|connect\.facebook\.net/i);
      expect(page.html).not.toMatch(/href="https?:\/\/(?:www\.)?youthecosummit\.com/i);
      expect(page.html).toMatch(/<h1\b/);
    }
  });
  it('retains every public asset locally with its original content hash', () => {
    const { assets } = JSON.parse(readFileSync(dataFile, 'utf8'));
    expect(assets.length).toBeGreaterThan(30);
    for (const asset of assets as { path: string; sha256: string }[]) {
      expect(asset.path).toMatch(/^\/reference-20261112\/[a-f0-9]{16}\.[a-z0-9]+$/);
      const bytes = readFileSync(resolve('public' + asset.path));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    }
  });
  it('preserves the live hero video, new sections and new-site workflow links', () => {
    const { pages } = JSON.parse(readFileSync(dataFile, 'utf8'));
    expect(pages['/'].html).toContain('data-hero-video');
    expect(pages['/'].html).toContain('Watch confidence');
    expect(pages['/'].html).toContain('Youth Eco Summit<br/><em>in action.');
    expect(pages['/'].html).toContain('Conversations<br/><em>worth watching.');
    expect(pages['/'].html).toContain('href="/competitions/enter"');
    expect(pages['/get-involved'].html).toContain('Choose your registration.');
  });
  it('keeps page anchors local and replaces captured loading placeholders with live content or working actions', () => {
    const { pages } = JSON.parse(readFileSync(dataFile, 'utf8'));
    for (const page of Object.values(pages) as { html: string }[]) {
      expect(page.html).not.toMatch(/href="\/#|>Loading(?:…|\.\.\.)</);
      for (const match of page.html.matchAll(/aria-controls="([^"]+)"/g)) expect(page.html).toContain(`id="${match[1]}"`);
    }
    expect(pages['/contact'].html).toContain('href="/forms/legacy-12146"');
    expect(pages['/showcase'].html).toContain('data-live-publications');
    expect(pages['/competitions'].html).toContain('href="#challenges"');
  });
});
