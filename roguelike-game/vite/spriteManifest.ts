import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { SpriteManifest, SpriteMeta } from '../src/render/spriteMeta';

const VIRTUAL_ID = 'virtual:sprite-manifest';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Lists every PNG under `<dir>/<folder>/<name>.png` as key "folder/name",
 * attaching the optional sidecar `<name>.json` metadata. Invalid JSON is
 * reported and ignored rather than breaking the build.
 */
export function scanSprites(dir: string, urlPrefix = 'assets/sprites'): SpriteManifest {
  const out: SpriteManifest = {};
  if (!fs.existsSync(dir)) return out;
  for (const folder of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const fdir = path.join(dir, folder.name);
    for (const file of fs.readdirSync(fdir)) {
      if (!file.toLowerCase().endsWith('.png')) continue;
      const name = file.slice(0, -4);
      let meta: SpriteMeta | undefined;
      const json = path.join(fdir, `${name}.json`);
      if (fs.existsSync(json)) {
        try {
          meta = JSON.parse(fs.readFileSync(json, 'utf8')) as SpriteMeta;
        } catch (err) {
          console.warn(`[sprite-manifest] ignoring invalid ${json}: ${(err as Error).message}`);
        }
      }
      out[`${folder.name}/${name}`] = { url: `${urlPrefix}/${folder.name}/${file}`, ...(meta ? { meta } : {}) };
    }
  }
  return out;
}

/**
 * Exposes `virtual:sprite-manifest`: the sprites currently present in
 * `public/assets/sprites`. Dropping a PNG into the folder during `npm run dev`
 * reloads the page with the new art; the browser never probes for missing files.
 */
export function spriteManifest(): Plugin {
  let dir = '';
  return {
    name: 'neon-swarm-sprite-manifest',
    configResolved(config) {
      dir = path.join(config.publicDir || path.join(config.root, 'public'), 'assets', 'sprites');
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      return `export default ${JSON.stringify(scanSprites(dir))};`;
    },
    configureServer(server) {
      server.watcher.add(dir);
      const onChange = (file: string) => {
        if (!file.startsWith(dir)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
      server.watcher.on('change', onChange);
    },
  };
}
