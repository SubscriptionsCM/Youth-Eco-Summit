import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('application route coverage', () => {
  for (const route of ['', 'about', 'showcase', 'competitions', 'competitions/[id]', 'how-to-participate', 'faq', 'schools', 'schools/register', 'register', 'contact', 'privacy', 'terms', 'login', 'dashboard', 'entries/[id]', 'admin/[[...section]]', 'judge', 'judge/[id]']) {
    it(`provides the ${route || 'home'} route`, () => {
      expect(existsSync(resolve('src/app', route, 'page.tsx'))).toBe(true);
    });
  }
});
