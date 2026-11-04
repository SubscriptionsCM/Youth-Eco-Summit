import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmailAccount } from '../src/components/email-account';

describe('participant recovery entry point', () => {
 it('offers password recovery from the email sign-in form', () => {
  const html = renderToStaticMarkup(createElement(EmailAccount, { onSignedIn: () => {} }));
  expect(html).toMatch(/<button[^>]*type="button"[^>]*>Forgot your password\?<\/button>/);
 });
});
