import data from '@/data/live-winners.json';

/** Controls for the publicly published winner highlights; contains no participant records. */
export function connectWinners(root: HTMLElement): () => void {
  const section = root.querySelector<HTMLElement>('.summit-winners-spotlight');
  if (!section) return () => {};
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const years = [2024, 2025, 2026] as const;
  let year: typeof years[number] = 2026, index = 0, paused = motion.matches;
  let visible = false, hovered = false, focused = false, disposed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const render = (replace = false) => {
    if (disposed) return;
    if (replace) {
      const template = document.createElement('template');
      template.innerHTML = data.panels[String(year) as keyof typeof data.panels];
      section.querySelector('#winner-edition-panel')?.replaceWith(template.content);
    }
    section.querySelectorAll<HTMLElement>('[role="tab"]').forEach(tab => {
      const active = tab.id === `winner-tab-${year}`;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    });
    const records = data.records.filter(record => record.year === year);
    const winner = records[index];
    const set = (selector: string, value: string) => {
      const element = section.querySelector(selector); if (element) element.textContent = value;
    };
    set('[data-winner-name]', winner.name); set('[data-winner-school]', winner.school);
    set('[data-winner-category]', winner.category); set('[data-winner-award]', winner.award);
    set('.winner-position', `${winner.position} · ${year}`);
    set('.winner-controls > p', `${index + 1} / ${records.length} highlights`);
    const toggle = section.querySelector<HTMLButtonElement>('.winner-rotation-toggle');
    if (toggle) {
      toggle.textContent = paused ? 'Play' : 'Pause'; toggle.setAttribute('aria-pressed', String(paused));
      toggle.setAttribute('aria-label', paused ? 'Play winner rotation' : 'Pause winner rotation');
    }
    section.querySelector('.winner-spotlight-profile')?.setAttribute('aria-live', timer ? 'off' : 'polite');
  };
  const sync = () => {
    if (disposed) return;
    clearInterval(timer); timer = undefined;
    if (!paused && visible && !hovered && !focused && !document.hidden) {
      timer = setInterval(() => { index = (index + 1) % data.records.filter(record => record.year === year).length; render(); }, 6500);
    }
    render();
  };
  const activate = (tab: HTMLElement, focus: boolean) => {
    const selected = Number(tab.id.replace('winner-tab-', ''));
    if (!years.includes(selected as typeof year)) return;
    year = selected as typeof year; index = 0; render(true); sync(); if (focus) tab.focus();
  };
  const click = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest<HTMLElement>('[role="tab"]');
    if (tab) { activate(tab, false); return; }
    const button = target?.closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.classList.contains('winner-rotation-toggle')) { paused = !paused; sync(); return; }
    const label = button.getAttribute('aria-label');
    if (label === 'Next winner' || label === 'Previous winner') {
      const length = data.records.filter(record => record.year === year).length;
      index = (index + (label === 'Next winner' ? 1 : -1) + length) % length; render();
    }
  };
  const keydown = (event: KeyboardEvent) => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
    if (!tab) return;
    const tabs = [...section.querySelectorAll<HTMLElement>('[role="tab"]')], current = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : -1;
    if (next >= 0) { event.preventDefault(); activate(tabs[next], true); }
  };
  const enter = () => { hovered = true; sync(); }, leave = () => { hovered = false; sync(); };
  const focusin = () => { focused = true; sync(); };
  const focusout = (event: FocusEvent) => { focused = event.relatedTarget instanceof Node && section.contains(event.relatedTarget); sync(); };
  const preference = () => { if (motion.matches) paused = true; sync(); };
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold: .1 });
  observer.observe(section);
  section.addEventListener('click', click); section.addEventListener('keydown', keydown);
  section.addEventListener('mouseenter', enter); section.addEventListener('mouseleave', leave);
  section.addEventListener('focusin', focusin); section.addEventListener('focusout', focusout);
  motion.addEventListener('change', preference); document.addEventListener('visibilitychange', sync); sync();
  return () => {
    disposed = true; clearInterval(timer); observer.disconnect(); section.removeEventListener('click', click); section.removeEventListener('keydown', keydown);
    section.removeEventListener('mouseenter', enter); section.removeEventListener('mouseleave', leave);
    section.removeEventListener('focusin', focusin); section.removeEventListener('focusout', focusout);
    motion.removeEventListener('change', preference); document.removeEventListener('visibilitychange', sync);
  };
}
