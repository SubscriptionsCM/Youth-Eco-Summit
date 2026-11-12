'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shouldPlayHero } from './live-media-policy';
import { LivePublications } from './live-publications';

const participation = [
  ['Already registered? Use your permanent school ID. If your school is missing, nominate it for review.', 'Find your school', '/schools'],
  ['You’ll need a registered school and a verified parent or guardian contact. School registration lasts across editions.', 'Student registration', '/register'],
  ['Read the published theme, class eligibility and submission guidelines before you begin.', 'Explore competitions', '/competitions'],
  ['Save your draft, upload your work and review the details. Keep your receipt after a successful submission.', 'Go to your dashboard', '/dashboard'],
  ['Explore the summit experience. Event attendance is a separate flow from registration and competition entry.', 'Explore the experience', '/experience'],
];

function connectHero(root: HTMLElement): () => void {
  const video = root.querySelector<HTMLVideoElement>('[data-hero-video]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-hero-video-toggle]');
  if (!video || !toggle) return () => {};
  const background = video.closest<HTMLElement>('[data-hero-background]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let intent: 'play' | 'pause' | null = null, visible = false, failed = false, disposed = false, playAttempt = 0;
  const label = () => {
    toggle.textContent = video.paused ? 'Play video' : 'Pause video';
    toggle.setAttribute('aria-label', video.paused ? 'Play background video' : 'Pause background video');
  };
  const update = () => {
    if (disposed) return;
    const attempt = ++playAttempt;
    background?.toggleAttribute('data-user-play', intent === 'play');
    if (!shouldPlayHero({ reducedMotion: motion.matches, intent, visible, hidden: document.hidden, failed })) {
      video.pause(); label(); return;
    }
    if (!video.getAttribute('src')) video.src = (matchMedia('(max-width: 760px)').matches ? video.dataset.mobileSrc : video.dataset.desktopSrc) || '';
    video.muted = true;
    void video.play().catch(error => {
      if (disposed || attempt !== playAttempt || error?.name === 'AbortError') return;
      if (visible && !document.hidden && video.paused) { intent = 'pause'; label(); }
    });
  };
  const click = () => { intent = video.paused ? 'play' : 'pause'; update(); };
  const preference = () => { if (motion.matches && intent === 'play') intent = null; update(); };
  const error = () => { failed = true; video.hidden = true; toggle.hidden = true; video.pause(); };
  toggle.hidden = false;
  toggle.addEventListener('click', click);
  video.addEventListener('playing', label); video.addEventListener('pause', label); video.addEventListener('error', error);
  motion.addEventListener('change', preference); document.addEventListener('visibilitychange', update);
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); }, { threshold: .05 });
  observer.observe(video);
  return () => {
    disposed = true; observer.disconnect(); toggle.removeEventListener('click', click);
    video.removeEventListener('playing', label); video.removeEventListener('pause', label); video.removeEventListener('error', error);
    motion.removeEventListener('change', preference); document.removeEventListener('visibilitychange', update); video.pause();
  };
}

/** Static reviewed markup plus scoped local controls; source JavaScript is never executed. */
export function LiveReferenceContent({ html }: { html: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [publicationsTarget, setPublicationsTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const root = host.current!;
    setPublicationsTarget(root.querySelector<HTMLElement>('[data-live-publications]'));
    const disconnectHero = connectHero(root);
    const speakers = root.querySelector<HTMLElement>('#summit-speaker-list');
    const partnerWindow = root.querySelector<HTMLElement>('.summit-partner-window');
    const partnerToggle = root.querySelector<HTMLButtonElement>('.summit-slider-toggle');
    const pausePartners = (paused: boolean) => {
      if (!partnerWindow || !partnerToggle) return;
      if (paused && !partnerWindow.dataset.yesExplore) {
        const track = partnerWindow.querySelector<HTMLElement>('.summit-partner-track');
        const matrix = track ? getComputedStyle(track).transform.match(/^matrix\(([^)]+)\)/) : null;
        const offset = matrix ? Math.max(0, -Number(matrix[1].split(',')[4])) : 0;
        partnerWindow.dataset.yesExplore = 'true'; partnerWindow.scrollLeft = offset;
      }
      partnerWindow.dataset.paused = String(paused); partnerToggle.setAttribute('aria-pressed', String(paused));
      partnerToggle.setAttribute('aria-label', paused ? 'Play partner logo slider' : 'Pause partner logo slider');
      partnerToggle.textContent = paused ? '▶ Play' : 'Ⅱ Pause';
      if (!paused) { delete partnerWindow.dataset.yesExplore; partnerWindow.scrollLeft = 0; }
    };
    let partnerDrag: { pointer: number; x: number; left: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !partnerWindow) return;
      pausePartners(true);
      // Touch keeps native horizontal/vertical gesture handling; mouse gets explicit dragging.
      if (event.pointerType === 'mouse') {
        partnerDrag = { pointer: event.pointerId, x: event.clientX, left: partnerWindow.scrollLeft };
        partnerWindow.setPointerCapture?.(event.pointerId);
      }
    };
    const pointerMove = (event: PointerEvent) => {
      if (!partnerDrag || !partnerWindow || event.pointerId !== partnerDrag.pointer) return;
      if (Math.abs(event.clientX - partnerDrag.x) > 4) {
        event.preventDefault(); partnerWindow.dataset.dragging = 'true';
        partnerWindow.scrollLeft = partnerDrag.left + partnerDrag.x - event.clientX;
      }
    };
    const pointerEnd = (event: PointerEvent) => {
      if (!partnerDrag || !partnerWindow || event.pointerId !== partnerDrag.pointer) return;
      partnerWindow.releasePointerCapture?.(event.pointerId); partnerDrag = null; delete partnerWindow.dataset.dragging;
    };
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const syncSpeakers = () => {
      if (!speakers) return;
      const previous = root.querySelector<HTMLButtonElement>('[aria-label="Previous 2026 speakers"]');
      const next = root.querySelector<HTMLButtonElement>('[aria-label="Next 2026 speakers"]');
      if (previous) previous.disabled = speakers.scrollLeft <= 2;
      if (next) next.disabled = speakers.scrollLeft + speakers.clientWidth >= speakers.scrollWidth - 2;
    };
    if (speakers) {
      speakers.tabIndex = 0; speakers.setAttribute('aria-label', '2026 speakers. Use left and right arrow keys to browse.');
      speakers.addEventListener('scroll', syncSpeakers, { passive: true }); syncSpeakers();
    }
    if (partnerWindow) {
      partnerWindow.tabIndex = 0; partnerWindow.setAttribute('aria-label', 'Partners. Use left and right arrow keys to browse.');
      partnerWindow.addEventListener('pointerdown', pointerDown); partnerWindow.addEventListener('pointermove', pointerMove);
      partnerWindow.addEventListener('pointerup', pointerEnd); partnerWindow.addEventListener('pointercancel', pointerEnd);
    }
    const activateTab = (tab: HTMLElement, focus: boolean) => {
      const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
      const index = tabs.indexOf(tab), panel = root.querySelector<HTMLElement>('#step-panel');
      if (index < 0 || !panel) return;
      tabs.forEach(item => { item.setAttribute('aria-selected', String(item === tab)); item.tabIndex = item === tab ? 0 : -1; });
      panel.setAttribute('aria-labelledby', tab.id);
      const [detail, cta, href] = participation[index];
      const paragraph = document.createElement('p'); paragraph.className = 'participation-detail'; paragraph.textContent = detail;
      const link = document.createElement('a'); link.className = 'text-link'; link.href = href; link.textContent = cta + ' ';
      const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗'; link.append(arrow);
      panel.replaceChildren(paragraph, link);
      if (focus) tab.focus();
    };
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const tab = target?.closest<HTMLElement>('[role="tab"]');
      if (tab) { activateTab(tab, false); return; }
      const faq = target?.closest<HTMLButtonElement>('.animated-faq-trigger');
      if (faq) {
        const open = faq.getAttribute('aria-expanded') !== 'true';
        faq.setAttribute('aria-expanded', String(open));
        const container = faq.closest<HTMLElement>('.animated-faq');
        if (container) container.dataset.open = String(open);
        const panel = container?.querySelector<HTMLElement>('.animated-faq-panel');
        if (panel) { panel.setAttribute('aria-hidden', String(!open)); panel.inert = !open; }
        return;
      }
      const sliderToggle = target?.closest<HTMLButtonElement>('.summit-slider-toggle');
      if (sliderToggle && partnerWindow) {
        pausePartners(sliderToggle.getAttribute('aria-pressed') !== 'true');
        return;
      }
      const button = target?.closest<HTMLButtonElement>('button[aria-controls="summit-speaker-list"]');
      if (button && speakers) {
        const direction = button.getAttribute('aria-label')?.startsWith('Previous') ? -1 : 1;
        speakers.scrollBy({ left: direction * (speakers.firstElementChild?.getBoundingClientRect().width || speakers.clientWidth) + direction * 24, behavior: reduced() ? 'instant' : 'smooth' });
      }
    };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const tab = target?.closest<HTMLElement>('[role="tab"]');
      if (tab) {
        const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')], current = tabs.indexOf(tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : -1;
        if (next >= 0) { event.preventDefault(); activateTab(tabs[next], true); }
        return;
      }
      if (target !== speakers && target !== partnerWindow) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !target) return;
      event.preventDefault();
      if (target === partnerWindow) pausePartners(true);
      const left = event.key === 'Home' ? 0 : event.key === 'End' ? target.scrollWidth : target.scrollLeft + (event.key === 'ArrowLeft' ? -1 : 1) * target.clientWidth * .8;
      target.scrollTo({ left, behavior: reduced() ? 'instant' : 'smooth' });
    };
    root.addEventListener('click', click); root.addEventListener('keydown', keydown);
    const resize = new ResizeObserver(syncSpeakers); if (speakers) resize.observe(speakers);
    return () => {
      disconnectHero(); resize.disconnect(); speakers?.removeEventListener('scroll', syncSpeakers);
      partnerWindow?.removeEventListener('pointerdown', pointerDown); partnerWindow?.removeEventListener('pointermove', pointerMove);
      partnerWindow?.removeEventListener('pointerup', pointerEnd); partnerWindow?.removeEventListener('pointercancel', pointerEnd);
      root.removeEventListener('click', click); root.removeEventListener('keydown', keydown);
    };
  }, [html]);
  return <><div className="live-reference-content" ref={host} dangerouslySetInnerHTML={{ __html: html }} />{publicationsTarget && createPortal(<LivePublications />, publicationsTarget)}</>;
}
