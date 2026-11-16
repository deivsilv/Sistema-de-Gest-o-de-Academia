import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const worker = await readFile('dist/sw.js', 'utf8');
function runtime(offline = false) {
  const listeners = {}, cached = new Map(), network = [], deleted = [];
  let skipped = false, claimed = false, files = [];
  const cache = {
    addAll: async (paths) => { files = paths; paths.forEach(path => cached.set(`https://steakup.test${path}`, new Response(path))); },
    match: async (request) => cached.get(typeof request === 'string' ? `https://steakup.test${request}` : request.url)?.clone(),
  };
  const self = { location: {origin:'https://steakup.test'}, addEventListener: (name, handler) => { listeners[name] = handler; }, skipWaiting: () => { skipped = true; }, clients:{claim:async()=>{claimed=true;}} };
  const context = { self, URL, Set, Response, caches:{open: async()=>cache, keys:async()=>['other-app-cache','steakup-static-old'],delete:async(name)=>{deleted.push(name);}}, fetch:async(request)=>{network.push(request.url);if(offline)throw new Error('offline');return new Response('network');} };
  vm.runInNewContext(worker, context);
  async function lifecycle(name) { let promise; listeners[name]({waitUntil:(task)=>{promise=task;}}); await promise; }
  async function request(url, mode='cors', method='GET') {
    let promise;
    listeners.fetch({request:{url,mode,method},respondWith:(task)=>{promise=task;}});
    return promise ? await promise : null;
  }
  return {listeners, lifecycle, request, network, deleted, files:()=>files, skipped:()=>skipped, claimed:()=>claimed};
}

test('manifesto e ícones reais de instalação, inclusive máscara e Apple', async()=>{
  const manifest=JSON.parse(await readFile('dist/manifest.webmanifest','utf8'));
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.scope,'/');
  for(const icon of manifest.icons){
    const png=await readFile(`dist${icon.src}`);
    const [size]=icon.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16),size); assert.equal(png.readUInt32BE(20),size);
  }
  const apple=await readFile('dist/pwa/apple-touch-icon.png');
  assert.equal(apple.readUInt32BE(16),180);
  assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
});
test('cache somente estático; não salva página principal nem dados autenticados', async()=>{
  const r=runtime(); await r.lifecycle('install');
  assert.ok(r.files().includes('/offline.html'));
  assert.ok(!r.files().includes('/index.html'));
  assert.ok(r.files().every(p=>p==='/offline.html'||p.startsWith('/pwa/')||/^\/assets\/[^/]+\.(js|css)$/.test(p)));
  assert.equal(r.skipped(),false);
});
test('navegação online sempre busca a rede; sem internet retorna apenas aviso público', async()=>{
  const online=runtime(); await online.lifecycle('install');
  assert.equal(await (await online.request('https://steakup.test/','navigate')).text(),'network');
  const offline=runtime(true); await offline.lifecycle('install');
  assert.equal(await (await offline.request('https://steakup.test/','navigate')).text(),'/offline.html');
});
test('não intercepta REST/Auth/Storage externos, POST nem arquivos desconhecidos', async()=>{
  const r=runtime(true); await r.lifecycle('install');
  for(const path of ['/rest/v1/treinos','/auth/v1/token','/storage/v1/object/sign/comprovantes/x']){
    assert.equal(await r.request(`https://project.supabase.co${path}`),null);
    assert.equal(await r.request(`https://steakup.test${path}`),null);
  }
  assert.equal(await r.request('https://steakup.test/','cors','POST'),null);
  assert.equal(await r.request('https://steakup.test/unknown.pdf'),null);
});
test('ativação limpa só caches do SteakUp; atualização exige mensagem explícita', async()=>{
  const r=runtime(); await r.lifecycle('activate');
  assert.deepEqual(r.deleted,['steakup-static-old']); assert.equal(r.claimed(),true);
  r.listeners.message({data:{type:'OTHER'}}); assert.equal(r.skipped(),false);
  r.listeners.message({data:{type:'SKIP_WAITING'}}); assert.equal(r.skipped(),true);
});
