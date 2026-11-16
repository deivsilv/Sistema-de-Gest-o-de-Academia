// Somente leituras autenticadas. Não cria contas nem modifica registros.
// Arquivo privado: [{"accessToken":"...","role":"ADMIN|PERSONAL|ALUNO"}, ...]
import { readFile } from 'node:fs/promises';

async function main() {
  const url = process.env.STEAKUP_LOAD_URL;
  const key = process.env.STEAKUP_LOAD_PUBLISHABLE_KEY;
  const file = process.env.STEAKUP_LOAD_SESSIONS_FILE;
  if (!url || !key || !file) throw new Error('Defina STEAKUP_LOAD_URL, STEAKUP_LOAD_PUBLISHABLE_KEY e STEAKUP_LOAD_SESSIONS_FILE. Use 50 sessões distintas de contas de teste.');
  const sessions = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(sessions) || sessions.length !== 50) throw new Error('O arquivo deve conter exatamente 50 sessões.');
  const subjects = new Set();
  for (const session of sessions) {
    if (!['ADMIN', 'PERSONAL', 'ALUNO'].includes(session.role) || typeof session.accessToken !== 'string') throw new Error('Sessão ou perfil inválido.');
    const claims = JSON.parse(Buffer.from(session.accessToken.split('.')[1], 'base64url').toString());
    if (!claims.sub || !claims.exp || claims.exp * 1000 <= Date.now()) throw new Error('Sessão expirada ou inválida.');
    subjects.add(claims.sub);
  }
  if (subjects.size !== 50) throw new Error('O teste exige 50 usuários distintos, sem reutilizar a mesma sessão.');
  const origin = new URL(url);
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Use HTTPS para o projeto remoto.');
  const results = await Promise.all(sessions.map(async (session) => {
    const paths = ['perfis?select=id,nome,perfil,cref,ativo&order=nome', 'planos?select=id,nome,valor,duracao_meses,ativo&order=nome', 'matriculas?select=aluno_id,plano_id,ativa,data_inicio,data_fim&ativa=eq.true', 'pagamentos?select=id,aluno_id,valor,data_pagamento,status,forma&order=data_pagamento.desc'];
    if (session.role !== 'ADMIN') paths.push('treinos?select=id,aluno_id,personal_id,titulo,descricao,ativo,criado_em&order=criado_em.desc');
    if (session.role !== 'PERSONAL') paths.push('comprovantes?select=aluno_id,status&status=eq.PENDENTE');
    return Promise.all(paths.map(async (path) => {
      const start = performance.now();
      try {
        const response = await fetch(new URL(`/rest/v1/${path}`, origin), { headers: { apikey: key, Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(15000) });
        await response.arrayBuffer(); // Mede também a transferência, sem registrar dados pessoais.
        return { ms: performance.now() - start, ok: response.ok, status: response.status };
      } catch { return { ms: performance.now() - start, ok: false, status: 0 }; }
    }));
  }));
  const queries = results.flat();
  const times = queries.map(r => r.ms).sort((a,b) => a-b);
  const errors = queries.filter(r => !r.ok).length;
  const slow = queries.filter(r => r.ms > 2000).length;
  console.log(JSON.stringify({ users: 50, requests: queries.length, errors, over2seconds: slow, p95ms: Math.round(times[Math.ceil(times.length * .95)-1]), maxMs: Math.round(times.at(-1)), passed: errors === 0 && slow === 0, scope: 'Leituras REST simultâneas. Não certifica navegação, login ou renderização dos navegadores.' }, null, 2));
  if (errors || slow) process.exitCode = 1;
}
main().catch(() => { console.error('Não foi possível executar o teste. Confira as variáveis STEAKUP_LOAD_*, o JSON privado com 50 sessões distintas e a validade dos tokens. Nenhuma credencial foi exibida.'); process.exitCode = 1; });
