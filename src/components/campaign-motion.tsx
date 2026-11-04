'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function CampaignMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!scope.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const root = scope.current!;
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => {
        gsap.fromTo(el, { y: 10, opacity: 0 }, {
          y: 0, opacity: 1, duration: .35, ease: 'power2.out',
          delay: Math.min(Number(el.dataset.revealDelay) || 0, .08),
          clearProps: 'transform,opacity',
          scrollTrigger: { trigger: el, start: 'top 98%', once: true },
        });
      });
      root.querySelectorAll<HTMLElement>('[data-enter-media]').forEach(el => {
        gsap.fromTo(el, { y: 12, opacity: 0 }, {
          y: 0, opacity: 1, duration: .4, ease: 'power2.out',
          clearProps: 'transform,opacity',
          scrollTrigger: { trigger: el, start: 'top 98%', once: true },
        });
      });
      const heroCopy = root.querySelectorAll('[data-hero-copy]');
      if (heroCopy.length) gsap.fromTo(heroCopy, { y: 10, opacity: 0 }, {
        y: 0, opacity: 1, duration: .35, stagger: .035, ease: 'power2.out',
        clearProps: 'transform,opacity',
      });
      root.querySelectorAll<HTMLElement>('[data-layer-scene]').forEach(scene => {
        scene.querySelectorAll<HTMLElement>('[data-layer]').forEach(layer => {
          const distance = Number(layer.dataset.layer || 12);
          gsap.fromTo(layer, { y: -distance / 2 }, {
            y: distance / 2, ease: 'none',
            scrollTrigger: { trigger: scene, start: 'top bottom', end: 'bottom top', scrub: 1.2 },
          });
        });
      });
      const refresh = () => ScrollTrigger.refresh();
      const refreshAfterDisclosure = (event: TransitionEvent) => {
        if (event.propertyName === 'grid-template-rows' &&
          event.target instanceof HTMLElement &&
          event.target.classList.contains('animated-faq-panel')) refresh();
      };
      const images = [...root.querySelectorAll('img')];
      images.forEach(img => img.addEventListener('load', refresh, { once: true }));
      root.addEventListener('transitionend', refreshAfterDisclosure);
      return () => {
        images.forEach(img => img.removeEventListener('load', refresh));
        root.removeEventListener('transitionend', refreshAfterDisclosure);
      };
    }, scope);
    return () => media.revert();
  }, [pathname]);

  return <div ref={scope}>{children}</div>;
}
