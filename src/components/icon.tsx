import { iconPaths, type IconName } from './icon-shapes';

/** Decorative icons inherit the surrounding size and color; controls keep their text labels. */
export function Icon({ name }: { name: IconName }) {
  return <svg className="site-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: 'inline-block', flexShrink: 0, verticalAlign: '-.15em' }}><path d={iconPaths[name]} /></svg>;
}
