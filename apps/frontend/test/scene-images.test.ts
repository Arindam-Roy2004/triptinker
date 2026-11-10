// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCENES } from '@/features/scenes/scenes';

class TestImage {
  static instances: TestImage[] = [];
  static decodeResult: () => Promise<void> = () => Promise.resolve();
  onload?: () => void;
  onerror?: () => void;
  decoding = '';
  fetchPriority = '';
  sizes = '';
  srcset = '';
  src = '';
  currentSrc = '';
  decode = vi.fn(() => TestImage.decodeResult());

  constructor() { TestImage.instances.push(this); }
}

beforeEach(() => {
  vi.resetModules();
  TestImage.instances = [];
  TestImage.decodeResult = () => Promise.resolve();
  vi.stubGlobal('Image', TestImage);
});
afterEach(() => vi.unstubAllGlobals());

describe('scene image loading', () => {
  it('shares a preload with navigation and waits for decoding before it can animate', async () => {
    const { loadSceneImage, SCENE_SIZES } = await import('@/features/scenes/scene-images');
    const preload = loadSceneImage(SCENES[0], 'low');
    const navigation = loadSceneImage(SCENES[0]);
    expect(navigation).toBe(preload);
    expect(TestImage.instances).toHaveLength(1);
    const probe = TestImage.instances[0];
    expect(probe.fetchPriority).toBe('high');
    expect(probe.sizes).toBe(SCENE_SIZES);
    expect(probe.srcset).toContain('960w');

    let finishDecode!: () => void;
    TestImage.decodeResult = () => new Promise<void>((resolve) => { finishDecode = resolve; });
    const resolved = vi.fn();
    void navigation.then(resolved);
    probe.currentSrc = '/scenes/scene-1-960.webp';
    probe.onload!();
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    finishDecode();
    expect(await navigation).toBe(TestImage.instances[1]);
  });

  it('draws from the chosen file without srcset, so natural size matches the file pixels', async () => {
    const { loadSceneImage } = await import('@/features/scenes/scene-images');
    const load = loadSceneImage(SCENES[0]);
    const probe = TestImage.instances[0];
    probe.currentSrc = '/scenes/scene-1-960.webp';
    probe.onload!();
    const drawn = await load;
    expect(drawn).not.toBe(probe);
    expect(drawn.src).toBe('/scenes/scene-1-960.webp');
    expect(drawn.srcset).toBe('');
    expect(drawn.sizes).toBe('');
  });

  it.each(['network', 'decode'] as const)('retries after a %s failure instead of caching a rejected load', async (failure) => {
    const { loadSceneImage } = await import('@/features/scenes/scene-images');
    const first = loadSceneImage(SCENES[0], 'low');
    const rejected = expect(first).rejects.toBeInstanceOf(Error);
    const probe = TestImage.instances[0];
    if (failure === 'network') probe.onerror!();
    else {
      TestImage.decodeResult = () => Promise.reject(new Error('Decode failed'));
      probe.onload!();
    }
    await rejected;
    TestImage.decodeResult = () => Promise.resolve();
    const before = TestImage.instances.length;
    const retry = loadSceneImage(SCENES[0]);
    expect(TestImage.instances).toHaveLength(before + 1);
    TestImage.instances[before].onload!();
    expect(await retry).toBe(TestImage.instances[before + 1]);
  });
});
