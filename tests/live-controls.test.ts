// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveReferenceContent } from '../src/components/live-reference-content';
import reference from '../src/data/live-presentation.json';

let root: Root, container: HTMLDivElement;
let reduced = false;
let playing: WeakSet<HTMLMediaElement>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  playing = new WeakSet();
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) { return !playing.has(this); });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { playing.add(this); this.dispatchEvent(new Event('playing')); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) { playing.delete(this); this.dispatchEvent(new Event('pause')); });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion') && reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); reduced = false; });
async function mount() { await act(async () => root.render(React.createElement(LiveReferenceContent, { html: reference.pages['/'].html }))); }

describe('live public controls', () => {
  it('does not restart winner rotation when an observer callback arrives after cleanup', async () => {
    let queued!: () => void;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        if (target.classList.contains('summit-winners-spotlight')) queued = () => this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      disconnect() {}
    });
    await mount(); await act(async () => root.render(null));
    const interval = vi.spyOn(globalThis, 'setInterval');
    queued(); expect(interval).not.toHaveBeenCalled();
  });

  it('browses winner editions and highlights independently of participation tabs', async () => {
    reduced = true; await mount();
    const tab = container.querySelector<HTMLButtonElement>('#winner-tab-2024')!;
    await act(async () => tab.click());
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-winner-name]')?.textContent).toBe('Sohan khan');
    expect(container.querySelector('#winner-edition-panel a')?.getAttribute('href')).toMatch(/^\/reference-20261112\//);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next winner"]')!.click());
    expect(container.querySelector('[data-winner-name]')?.textContent).toBe('Yashita Sharma');
    expect(container.querySelector('#step-tab-0')?.getAttribute('aria-selected')).toBe('true');
    await act(async () => tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(container.querySelector('#winner-tab-2026')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-winner-name]')?.textContent).toBe('Dhir Vikram Aggarwal');
  });
  it('starts winner rotation paused for reduced motion and allows explicit play', async () => {
    reduced = true; await mount();
    const toggle = container.querySelector<HTMLButtonElement>('.winner-rotation-toggle')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Play winner rotation');
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('reveals reduced-motion video only after explicit Play and clears the override on Pause', async () => {
    reduced = true; await mount();
    const video = container.querySelector<HTMLVideoElement>('video')!;
    const button = container.querySelector<HTMLButtonElement>('[data-hero-video-toggle]')!;
    const background = video.closest<HTMLElement>('[data-hero-background]')!;
    expect(video.paused).toBe(true); expect(video.hasAttribute('src')).toBe(false);
    await act(async () => button.click());
    expect(video.paused).toBe(false); expect(background.hasAttribute('data-user-play')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Pause background video');
    await act(async () => button.click());
    expect(video.paused).toBe(true); expect(background.hasAttribute('data-user-play')).toBe(false);
  });
  it('enables native horizontal browsing when partner animation is paused', async () => {
    await mount();
    const button = container.querySelector<HTMLButtonElement>('.summit-slider-toggle')!;
    const window = container.querySelector<HTMLElement>('.summit-partner-window')!;
    await act(async () => button.click());
    expect(window.dataset.paused).toBe('true'); expect(window.dataset.yesExplore).toBe('true');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await act(async () => button.click());
    expect(window.dataset.paused).toBe('false'); expect(window.dataset.yesExplore).toBeUndefined();
  });
  it('updates FAQ access state and participation tab content without replacing the page', async () => {
    await mount();
    const faq = container.querySelector<HTMLButtonElement>('.animated-faq-trigger')!;
    await act(async () => faq.click());
    expect(faq.getAttribute('aria-expanded')).toBe('true');
    const panel = container.querySelector<HTMLElement>('#'+faq.getAttribute('aria-controls'))!;
    expect(panel.getAttribute('aria-hidden')).toBe('false'); expect(panel.inert).toBe(false);
    const tab = container.querySelector<HTMLButtonElement>('#step-tab-3')!;
    await act(async () => tab.click());
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('#step-panel a')?.getAttribute('href')).toBe('/dashboard');
    expect(container.querySelector('h1')?.textContent).toContain('Waste Segregation:');
  });
  it('lets a mouse drag the partner logos and keeps them paused for browsing', async () => {
    await mount();
    const window = container.querySelector<HTMLElement>('.summit-partner-window')!;
    Object.defineProperty(window, 'setPointerCapture', { value: vi.fn(), configurable: true });
    Object.defineProperty(window, 'releasePointerCapture', { value: vi.fn(), configurable: true });
    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 200, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 100, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse', pointerId: 1, clientX: 100, bubbles: true }));
    });
    expect(window.scrollLeft).toBe(100);
    expect(window.dataset.yesExplore).toBe('true'); expect(window.dataset.paused).toBe('true');
  });
  it('resumes autoplay after a pending play is aborted by hiding the document', async () => {
    let hidden = false, rejectPlay!: (reason: Error) => void;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectPlay = reject; }));
    await mount();
    await act(async () => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); rejectPlay(new DOMException('Paused', 'AbortError')); });
    await act(async () => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    expect(play).toHaveBeenCalledTimes(2);
    expect(container.querySelector<HTMLVideoElement>('video')!.paused).toBe(false);
  });
});
