import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetainedFileDownload, RetainedFilePage, RetainedFormFiles } from '../src/components/retained-form-files';

const harness = vi.hoisted(() => ({
  active: false, cursor: 0, values: [] as unknown[], api: vi.fn(), assign: vi.fn(),
}));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState(initial: unknown) {
      if (!harness.active) return actual.useState(initial);
      const index = harness.cursor++;
      if (!(index in harness.values)) harness.values[index] = initial;
      return [harness.values[index], (value: unknown) => { harness.values[index] = value; }];
    },
  };
});
vi.mock('../src/components/shared', async original => ({
  ...await original<typeof import('../src/components/shared')>(),
  AuthGate: ({ children }: { children: (actor: object) => ReactNode }) => children({ role: 'participant' }),
}));
vi.mock('../src/components/api', async original => ({
  ...await original<typeof import('../src/components/api')>(), api: harness.api,
}));
function component<T>(render: () => T): T {
  harness.cursor = 0;
  harness.active = true;
  try { return render(); }
  finally { harness.active = false; }
}
function elements(node: ReactNode): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<any>(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...elements(element.props.children)];
}
function button(node: ReactNode) {
  const found = elements(node).find(element => element.type === 'button');
  if (!found) throw new Error('Download button missing');
  return found;
}
const fileId = '123e4567-e89b-42d3-a456-426614174000';
beforeEach(() => {
  harness.cursor = 0;
  harness.values = [];
  harness.api.mockReset();
  harness.assign.mockReset();
  vi.stubGlobal('window', { location: { assign: harness.assign } });
});
afterEach(() => vi.unstubAllGlobals());

describe('submitted file access', () => {
  it('renders the authenticated emailed-file destination', () => {
    expect(renderToStaticMarkup(RetainedFilePage({ fileId }))).toContain('Download submitted file');
  });
  it('rejects malformed notification file identifiers', () => {
    expect(renderToStaticMarkup(RetainedFilePage({ fileId: '../../private.env' }))).toContain('Invalid file link');
  });
  it('uses the existing owner-checked endpoint before navigating to retained bytes', async () => {
    harness.api.mockResolvedValue({ url: 'https://portal.example.org/api/private-storage?token=scoped' });
    const tree = component(() => RetainedFileDownload({ fileId, token: 'private-test-draft' }));
    await button(tree).props.onClick();
    expect(harness.api).toHaveBeenCalledWith(`/api/forms/files/${fileId}/download`, expect.objectContaining({
      method: 'POST', headers: { 'X-Draft-Key': 'private-test-draft' },
    }));
    expect(harness.assign).toHaveBeenCalledWith('https://portal.example.org/api/private-storage?token=scoped');
  });
  it('shows a retryable error when this account cannot access the file', async () => {
    harness.api.mockRejectedValue(new Error('Private file is unavailable to this account.'));
    await button(component(() => RetainedFileDownload({ fileId }))).props.onClick();
    const tree = component(() => RetainedFileDownload({ fileId }));
    expect(renderToStaticMarkup(tree)).toContain('Private file is unavailable to this account.');
    expect(button(tree).props.disabled).toBe(false);
    expect(harness.assign).not.toHaveBeenCalled();
  });
  it('keeps verified files downloadable on submitted receipts', () => {
    const html = renderToStaticMarkup(RetainedFormFiles({ files: [
      { id: fileId, filename: 'Verified.pdf', status: 'ready' },
      { id: 'other', filename: 'Pending.pdf', status: 'uploaded' },
    ] }));
    expect(html).toContain('Verified.pdf');
    expect(html).toContain('Download submitted file');
    expect(html).not.toContain('Pending.pdf');
  });
});
