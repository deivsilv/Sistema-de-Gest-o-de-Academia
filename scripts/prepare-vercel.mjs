import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
// Envia somente o build público. Código do backend, .env e documentos não são publicados.
const settings = JSON.parse(await readFile('vercel.json', 'utf8'));
const output = resolve('.vercel/output');
const staticDirectory = resolve(output, 'static');
if (!staticDirectory.startsWith(output + sep)) throw new Error('Destino fora da pasta de build.');
// Limpa apenas o diretório gerado e verificado, para não republicar bundles antigos.
await rm(staticDirectory, { recursive: true, force: true });
await mkdir(staticDirectory, { recursive: true });
await cp('dist', staticDirectory, { recursive: true });
// Distribuição separada: o APK não entra em public/ nem nos assets do próximo APK.
for (const fileName of ['SteakUp-1.0.0.apk', 'SteakUp-1.0.1.apk', 'SteakUp-1.0.2.apk', 'SteakUp-1.0.3.apk', 'SteakUp-1.0.4.apk', 'SteakUp-1.0.5.apk']) {
  const apk = resolve('android/app/build/outputs/apk/release', fileName);
  if (!existsSync(apk)) continue;
  const downloads = resolve(staticDirectory, 'downloads');
  await mkdir(downloads, { recursive: true });
  await cp(apk, resolve(downloads, fileName));
}
await writeFile('.vercel/output/config.json', JSON.stringify({
  version: 3,
  routes: [
    ...settings.headers.map(({ source, headers }) => ({
      src: '^' + source.replaceAll('.', '\\.') + '$',
      headers: Object.fromEntries(headers.map(({ key, value }) => [key, value])),
      continue: true,
    })),
    { handle: 'filesystem' },
  ],
}, null, 2));
console.log('Artefato estático pronto em .vercel/output (sem .env, backend ou documentos).');
