import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/components/auth-pages';
import { EmailAccount } from '../src/components/email-account';

const harness = vi.hoisted(() => ({
  rendering: false, cursor: 0, values: [] as unknown[], effects: [] as (() => void)[],
  dependencies: [] as unknown[],
  config: { data: { emailAccounts: true } as Record<string, unknown> | null, loading: false, error: '', reload: vi.fn() },
  api: vi.fn(), assign: vi.fn(),
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  // Drive LoginPage's events without a browser. Render its children with real hooks.
  return {
    ...actual,
    useState(initial: unknown) {
      if (!harness.rendering) return actual.useState(initial);
      const index = harness.cursor++;
      if (!(index in harness.values)) harness.values[index] = typeof initial === 'function' ? initial() : initial;
      return [harness.values[index], (value: unknown) => {
        harness.values[index] = typeof value === 'function' ? value(harness.values[index]) : value;
      }];
    },
    useEffect(effect: () => void, dependencies: unknown[]) {
      if (!harness.rendering) return actual.useEffect(effect, dependencies);
      const index = harness.cursor++;
      const previous = harness.dependencies[index] as unknown[] | undefined;
      if (!previous || dependencies.some((value, position) => value !== previous[position])) {
        harness.dependencies[index] = dependencies;
        harness.effects.push(effect);
      }
    },
  };
});
vi.mock('../src/components/shared', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/shared')>(),
  useResource: (path: string) => {
    if (path !== '/api/forms/config') throw new Error(`Unexpected resource ${path}`);
    return harness.config;
  },
}));
vi.mock('../src/components/api', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/api')>(), api: harness.api,
}));

function page() {
  harness.cursor = 0;
  harness.rendering = true;
  let tree: ReactElement;
  try { tree = LoginPage(); } finally { harness.rendering = false; }
  const effects = harness.effects.splice(0);
  for (const effect of effects) effect();
  return tree;
}
function account(props: Parameters<typeof EmailAccount>[0]) {
  harness.cursor = 0;
  harness.rendering = true;
  try { return EmailAccount(props); } finally { harness.rendering = false; }
}
function find(node: ReactNode, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  return predicate(node) ? node : find(node.props.children, predicate);
}
function element(tree: ReactNode, predicate: (element: ReactElement<any>) => boolean) {
  const result = find(tree, predicate);
  expect(result).toBeDefined();
  return result!;
}

beforeEach(() => {
  harness.values = []; harness.dependencies = []; harness.effects = []; harness.cursor = 0;
  harness.config = { data: { emailAccounts: true }, loading: false, error: '', reload: vi.fn() };
  harness.api.mockReset(); harness.assign.mockReset();
  vi.stubGlobal('window', { location: { search: '', assign: harness.assign } });
});
afterEach(() => vi.unstubAllGlobals());

describe('global participant login provider', () => {
  it('renders the existing email account and recovery flow when configured', () => {
    const html = renderToStaticMarkup(page());
    expect(html).toContain('Email address');
    expect(html).toContain('Forgot your password?');
    expect(html).not.toContain('Verified contact phone');
  });

  it('keeps phone OTP available when email accounts are disabled', async () => {
    harness.config.data = { emailAccounts: false };
    let tree = page();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('Verified contact phone');
    expect(html).toContain('Send verification code');
    element(tree, node => node.props.name === 'contact').props.onChange({ target: { value: '+919876543210' } });
    tree = page();
    harness.api.mockResolvedValueOnce({ retryAfter: 60 });
    await element(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    expect(harness.api).toHaveBeenCalledWith('/api/auth/otp/request', expect.objectContaining({ body: JSON.stringify({ contact: '+919876543210' }) }));
    expect(renderToStaticMarkup(page())).toContain('Verification code');
    vi.stubGlobal('FormData', class extends Map<string, string> { constructor() { super([['code', '123456']]); } });
    harness.api.mockResolvedValueOnce({ actor: { role: 'participant' } });
    await element(page(), node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    expect(harness.api).toHaveBeenCalledWith('/api/auth/otp/verify', expect.objectContaining({ body: JSON.stringify({ code: '123456', contact: '+919876543210' }) }));
    expect(harness.assign).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps staff password and authenticator sign-in independent of provider errors', async () => {
    harness.config = { data: null, loading: false, error: 'Configuration unavailable', reload: vi.fn() };
    let tree = page();
    element(tree, node => node.type === 'button' && node.props.children === 'Admin or judge').props.onClick();
    tree = page();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('Staff email');
    expect(html).toContain('Authenticator code');
    expect(html).toContain('Recover account access');
    element(tree, node => node.props.name === 'contact').props.onChange({ target: { value: 'judge@example.org' } });
    vi.stubGlobal('FormData', class extends Map<string, string> { constructor() { super([['password', 'test passphrase'], ['totp', '123456']]); } });
    harness.api.mockResolvedValueOnce({ actor: { role: 'judge' } });
    await element(page(), node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    expect(harness.api).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ body: JSON.stringify({ password: 'test passphrase', totp: '123456', contact: 'judge@example.org' }) }));
    expect(harness.assign).toHaveBeenCalledWith('/judge');
  });

  it.each([
    ['/competitions/enter?competition=poetry', '/competitions/enter?competition=poetry'],
    ['//untrusted.example', '/dashboard'],
    ['/admin', '/dashboard'],
  ])('redirects email sign-in safely for next=%s', async (next, expected) => {
    window.location.search = `?${new URLSearchParams({ next })}`;
    page();
    let tree = page();
    // An admin destination initially selects staff. The participant can switch back.
    element(tree, node => node.type === 'button' && node.props.children === 'Participant').props.onClick();
    tree = page();
    harness.api.mockResolvedValueOnce({ actor: { role: 'participant' } });
    await element(tree, node => node.type === EmailAccount).props.onSignedIn();
    expect(harness.api).toHaveBeenCalledWith('/api/auth/session');
    expect(harness.assign).toHaveBeenCalledWith(expected);
  });

  it('shows a loading state without prematurely offering phone login', () => {
    harness.config = { data: null, loading: true, error: '', reload: vi.fn() };
    const html = renderToStaticMarkup(page());
    expect(html).toContain('role="status"');
    expect(html).not.toContain('Verified contact phone');
  });

  it.each(['missing actor', 'session request failed'])('keeps email sign-in actionable when %s', async failure => {
    if (failure === 'missing actor') harness.api.mockResolvedValueOnce({ actor: null });
    else harness.api.mockRejectedValueOnce(new Error('Session temporarily unavailable'));
    await element(page(), node => node.type === EmailAccount).props.onSignedIn();
    expect(harness.assign).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(page());
    expect(html).toContain('role="alert"');
    expect(html).toContain('Email address');
  });

  it('offers a retry when provider configuration fails', () => {
    harness.config = { data: null, loading: false, error: 'Configuration unavailable', reload: vi.fn() };
    const tree = page();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('Configuration unavailable');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Verified contact phone');
  });
});

describe('WordPress signup and recovery UI', () => {
  it('keeps the chosen password out of the signup request and sends it only with final verification', async () => {
    const props = { provider: 'wordpress' as const, registrationForm: 'student' as const, onSignedIn: vi.fn() };
    let tree = account(props);
    element(tree, node => node.type === 'button' && node.props.children === 'Create a new account').props.onClick();
    tree = account(props);
    expect(element(tree, node => node.props.name === 'password').props.minLength).toBe(1);
    element(tree, node => node.props.name === 'contact').props.onChange({ target: { value: 'new@example.org' } });
    vi.stubGlobal('FormData', class extends Map<string, string> { constructor() { super([['username', 'chosen-name'], ['password', 'p!'], ['confirmPassword', 'p!']]); } });
    harness.api.mockResolvedValueOnce({ sent: true, message: 'Check your email' });
    await element(account(props), node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    expect(harness.api).toHaveBeenCalledWith('/api/auth/participant/signup', expect.objectContaining({ body: JSON.stringify({ contact: 'new@example.org', username: 'chosen-name', formKey: 'student' }) }));
    expect(renderToStaticMarkup(account(props))).not.toContain('type="password"');
    vi.stubGlobal('FormData', class extends Map<string, string> { constructor() { super([['code', '123456']]); } });
    harness.api.mockResolvedValueOnce({ actor: { role: 'participant', contact: 'new@example.org' } });
    await element(account(props), node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    expect(harness.api).toHaveBeenLastCalledWith('/api/auth/participant/verify', expect.objectContaining({ body: JSON.stringify({ contact: 'new@example.org', username: 'chosen-name', formKey: 'student', code: '123456', password: 'p!' }) }));
    expect(props.onSignedIn).toHaveBeenCalledWith({ email: 'new@example.org', username: 'chosen-name' });
    expect(JSON.stringify(harness.values)).not.toContain('p!');
  });

  it('uses the native emailed recovery link instead of asking for a recovery code', async () => {
    const props = { provider: 'wordpress' as const, onSignedIn: vi.fn() };
    let tree = account(props);
    element(tree, node => node.type === 'button' && node.props.children === 'Forgot your password?').props.onClick();
    tree = account(props);
    expect(renderToStaticMarkup(tree)).toContain('Send reset link');
    element(tree, node => node.props.name === 'contact').props.onChange({ target: { value: 'existing-name' } });
    vi.stubGlobal('FormData', class extends Map<string, string> { constructor() { super(); } });
    harness.api.mockResolvedValueOnce({ recovery: 'link', message: 'Follow the emailed password-reset link.' });
    await element(account(props), node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: {} });
    const html = renderToStaticMarkup(account(props));
    expect(html).toContain('Follow the emailed password-reset link.');
    expect(html).not.toContain('Recovery code');
    expect(html).toContain('Sign in to your account');
    expect(props.onSignedIn).not.toHaveBeenCalled();
  });
});
