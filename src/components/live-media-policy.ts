export function shouldPlayHero(state: {
  reducedMotion: boolean;
  intent: 'play' | 'pause' | null;
  visible: boolean;
  hidden: boolean;
  failed: boolean;
}): boolean {
  return !state.failed && state.visible && !state.hidden &&
    (state.intent === 'play' || (state.intent !== 'pause' && !state.reducedMotion));
}
