import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const assets = (await readdir(resolve(dist, 'assets')))
  .filter(name => /\.(?:js|css)$/.test(name)).map(name => `/assets/${name}`);
const files = ['/offline.html', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/maskable-512.png', '/pwa/apple-touch-icon.png', ...assets].sort();
const hash = createHash('sha256');
for (const file of ['/index.html', '/manifest.webmanifest', ...files]) {
  hash.update(file).update(await readFile(resolve(dist, `.${file}`)));
}
const template = await readFile('scripts/service-worker.template.js', 'utf8');
// Inclui o próprio código do worker na versão: mudanças da política também atualizam.
hash.update(template);
const version = hash.digest('hex').slice(0, 16);
await writeFile(resolve(dist, 'sw.js'), template
  .replace('__STEAKUP_CACHE_NAME__', `steakup-static-${version}`)
  .replace('__STEAKUP_STATIC_FILES__', JSON.stringify(files)), 'utf8');
console.log(`PWA: service worker ${version}, ${files.length} arquivos estáticos; dados da API fora do cache.`);
