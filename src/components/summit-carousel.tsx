'use client';
import '@/app/summit-sections.css';

import { Children, useCallback, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';

type CarouselProps = {
  children: ReactNode;
  label: string;
  className: string;
  autoplay?: boolean;
};

/** Native scrolling keeps touch, trackpad, keyboard and mouse dragging in sync. */
export function SummitCarousel({ children, label, className, autoplay = false }: CarouselProps) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const touchActive = useRef(false);
  const [dragging, setDragging] = useState(false);
  const direction = useRef<1 | -1>(1);
  const resumeAfter = useRef(0);
  const pauseForInteraction = () => { resumeAfter.current = performance.now() + 2800; };
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [position, setPosition] = useState({ first: 1, last: 1, back: false, forward: true });
  const count = Children.count(children);

  const updatePosition = useCallback(() => {
    const list = viewport.current;
    if (!list) return;
    const bounds = list.getBoundingClientRect();
    const visible = Array.from(list.children).flatMap((child, index) => {
      const rect = child.getBoundingClientRect();
      return rect.right > bounds.left + 8 && rect.left < bounds.right - 8 ? [index + 1] : [];
    });
    const next = {
      first: visible[0] ?? 1,
      last: visible.at(-1) ?? count,
      back: list.scrollLeft > 3,
      forward: list.scrollLeft < list.scrollWidth - list.clientWidth - 3,
    };
    setPosition(previous => previous.first === next.first && previous.last === next.last && previous.back === next.back && previous.forward === next.forward ? previous : next);
  }, [count]);

  useEffect(() => {
    const list = viewport.current;
    if (!list) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener('change', updateMotion);
    const observer = new ResizeObserver(updatePosition);
    observer.observe(list);
    updatePosition();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', updateMotion);
    };
  }, [updatePosition]);

  const move = useCallback((stepDirection: -1 | 1) => {
    const list = viewport.current;
    if (!list) return;
    resumeAfter.current = performance.now() + 2800;
    direction.current = stepDirection;
    const card = list.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
    const step = card ? card.offsetWidth + gap : list.clientWidth * .85;
    list.scrollBy({ left: stepDirection * step, behavior: reducedMotion ? 'instant' : 'smooth' });
  }, [reducedMotion]);

  useEffect(() => {
    if (!autoplay || hovered || focused || reducedMotion || dragging || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const list = viewport.current;
    if (!list) return;
    let frame = 0;
    let previousTime = 0;
    // Keep fractional pixels ourselves: some browsers round scrollLeft values.
    let position = list.scrollLeft;
    function glide(time: number) {
      const current = viewport.current;
      if (!current) return;
      const maximum = current.scrollWidth - current.clientWidth;
      const bounds = current.getBoundingClientRect();
      if (document.hidden || time < resumeAfter.current || maximum <= 0 || bounds.bottom <= 0 || bounds.top >= window.innerHeight) {
        previousTime = 0;
        position = current.scrollLeft;
      } else {
        const elapsed = previousTime ? Math.min(time - previousTime, 32) : 0;
        previousTime = time;
        position += direction.current * elapsed * .03;
        if (position >= maximum) { position = maximum; direction.current = -1; }
        if (position <= 0) { position = 0; direction.current = 1; }
        current.scrollLeft = position;
      }
      frame = window.requestAnimationFrame(glide);
    }
    frame = window.requestAnimationFrame(glide);
    return () => window.cancelAnimationFrame(frame);
  }, [autoplay, hovered, focused, reducedMotion, dragging]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pauseForInteraction();
    setFocused(false);
    if (event.pointerType === 'touch') setDragging(true);
    suppressClick.current = false;
    // Touch retains the browser's native scroll momentum and vertical page gestures.
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const origin = drag.current;
    if (!origin) return;
    const distance = event.clientX - origin.x;
    if (!origin.moved && Math.abs(distance) < 5) return;
    if (!origin.moved) {
      origin.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    event.preventDefault();
    suppressClick.current = true;
    event.currentTarget.scrollLeft = origin.left - distance;
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    pauseForInteraction();
    drag.current = null;
    setDragging(touchActive.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className={`summit-carousel ${className}`} role="region" aria-roledescription="carousel" aria-label={label}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }} onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(false); }}
      onKeyDownCapture={() => setFocused(true)}
      onFocusCapture={event => {
        // Keyboard focus holds the logos still; a touch/mouse browse can resume.
        setFocused(event.target instanceof HTMLElement && event.target.matches(':focus-visible'));
      }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className="summit-carousel-controls">
        <span className="summit-carousel-count">{position.first === position.last ? position.first : `${position.first}–${position.last}`} / {count}{!autoplay && <span className="summit-carousel-hint">Swipe or drag to explore</span>}</span>
        <div className="summit-carousel-buttons">
          <button type="button" onClick={() => move(-1)} disabled={!position.back} aria-label={`Previous ${label.toLowerCase()}`} aria-controls={id}>←</button>
          <button type="button" onClick={() => move(1)} disabled={!position.forward} aria-label={`Next ${label.toLowerCase()}`} aria-controls={id}>→</button>
        </div>
      </div>
      <div id={id} className="summit-carousel-viewport" ref={viewport} tabIndex={0} aria-label={`${label}. Use left and right arrow keys to browse.`} data-dragging={dragging} data-autoplay={autoplay}
        onScroll={() => { if (autoplay && performance.now() < resumeAfter.current) pauseForInteraction(); updatePosition(); }} onWheel={pauseForInteraction}
        onTouchStart={() => { touchActive.current = true; setDragging(true); pauseForInteraction(); }}
        onTouchEnd={() => { touchActive.current = false; setDragging(false); pauseForInteraction(); }}
        onTouchCancel={() => { touchActive.current = false; setDragging(false); pauseForInteraction(); }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onPointerLeave={() => { if (drag.current && !drag.current.moved) { drag.current = null; setDragging(false); } }}
        onDragStart={event => event.preventDefault()}
        onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          setFocused(true);
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
          if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); pauseForInteraction(); event.currentTarget.scrollTo({ left: event.key === 'Home' ? 0 : event.currentTarget.scrollWidth, behavior: reducedMotion ? 'instant' : 'smooth' }); }
        }}>
        {children}
      </div>
    </div>
  );
}
