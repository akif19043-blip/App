import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanSprites } from '../vite/spriteManifest';

let dir = '';
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function tmp(files: Record<string, string>): string {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprites-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

describe('scanSprites', () => {
  it('lists PNGs by folder/name with relative URLs and sidecar metadata', () => {
    const d = tmp({
      'enemies/swarmer.png': 'x',
      'enemies/swarmer.json': '{"frames": 4, "fps": 8}',
      'player/player.PNG': 'x',
      'player/notes.txt': 'ignored',
      'weapons/.gitkeep': '',
    });
    expect(scanSprites(d)).toEqual({
      'enemies/swarmer': { url: 'assets/sprites/enemies/swarmer.png', meta: { frames: 4, fps: 8 } },
      'player/player': { url: 'assets/sprites/player/player.PNG' },
    });
  });

  it('ignores invalid sidecar JSON instead of failing the build', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = tmp({ 'enemies/tank.png': 'x', 'enemies/tank.json': '{ nope' });
    expect(scanSprites(d)).toEqual({ 'enemies/tank': { url: 'assets/sprites/enemies/tank.png' } });
  });

  it('returns an empty manifest when the folder does not exist', () => {
    expect(scanSprites(path.join(os.tmpdir(), 'definitely-missing-sprites-dir'))).toEqual({});
  });
});
