import { describe, expect, it } from 'vitest';
describe('reference hero video playback', () => {
  it('respects motion preference, visibility, errors and explicit play/pause intent', async () => {
    const { shouldPlayHero } = await import('../src/components/live-media-policy');
    const base = { reducedMotion: false, intent: null, visible: true, hidden: false, failed: false } as const;
    expect(shouldPlayHero(base)).toBe(true);
    expect(shouldPlayHero({ ...base, reducedMotion: true })).toBe(false);
    expect(shouldPlayHero({ ...base, intent: 'pause' })).toBe(false);
    expect(shouldPlayHero({ ...base, reducedMotion: true, intent: 'play' })).toBe(true);
    expect(shouldPlayHero({ ...base, intent: 'play', visible: false })).toBe(false);
    expect(shouldPlayHero({ ...base, hidden: true })).toBe(false);
    expect(shouldPlayHero({ ...base, failed: true })).toBe(false);
  });
});
