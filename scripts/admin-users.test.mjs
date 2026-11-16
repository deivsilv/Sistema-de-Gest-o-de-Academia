import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transform } from "esbuild";
const source = readFileSync(
  new URL("../supabase/functions/admin-users/index.ts", import.meta.url),
  "utf8",
).replace(/^import \{ createClient \} from .*;\r?$/m, "");
const code = (
  await transform(source, { loader: "ts", target: "es2022", format: "esm" })
).code;
const targetId = "11111111-1111-4111-8111-111111111111";
function setup(actorRole = "ADMIN", targetRole = "PERSONAL") {
  let handler;
  const calls = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "actor" } }, error: null }),
      admin: {
        getUserById: async (id) => ({
          data: { user: { id, email: "personal@example.test" } },
          error: null,
        }),
        updateUserById: async (id, data) => {
          calls.push({ id, data });
          return { data: { user: { id } }, error: null };
        },
      },
    },
    from() {
      let id;
      return {
        select() {
          return this;
        },
        eq(_key, value) {
          id = value;
          return this;
        },
        async single() {
          return {
            data:
              id === "actor"
                ? { perfil: actorRole, ativo: true }
                : { id, perfil: targetRole },
            error: null,
          };
        },
      };
    },
  };
  vm.runInNewContext(code, {
    Request,
    Response,
    TextEncoder,
    createClient: () => client,
    Deno: {
      env: {
        get: (name) =>
          name === "SUPABASE_URL"
            ? "https://example.test"
            : name === "SUPABASE_SERVICE_ROLE_KEY"
              ? "test-server-secret"
              : undefined,
      },
      serve: (fn) => (handler = fn),
    },
  });
  const request = (body, auth = true, origin = "http://localhost:5173") =>
    handler(
      new Request("https://example.test/functions/v1/admin-users", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(auth ? { Authorization: "Bearer test-session" } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  return { request, calls };
}
test("acesso: exige token", async () => {
  const s = setup();
  assert.equal(
    (await s.request({ action: "get", id: targetId, kind: "trainers" }, false))
      .status,
    401,
  );
  assert.equal(s.calls.length, 0);
});
test("acesso: aluno e personal não podem gerenciar contas", async () => {
  for (const role of ["ALUNO", "PERSONAL"]) {
    const s = setup(role);
    assert.equal(
      (
        await s.request({
          action: "password",
          id: targetId,
          kind: "trainers",
          password: "Test-password-123",
        })
      ).status,
      403,
    );
    assert.equal(s.calls.length, 0);
  }
});
test("acesso: não permite redefinir administrador por operação de personal", async () => {
  const s = setup("ADMIN", "ADMIN");
  assert.equal(
    (
      await s.request({
        action: "password",
        id: targetId,
        kind: "trainers",
        password: "Test-password-123",
      })
    ).status,
    404,
  );
  assert.equal(s.calls.length, 0);
});
test("acesso: consulta somente e-mail e id, sem hash ou senha", async () => {
  const s = setup();
  const r = await s.request({ action: "get", id: targetId, kind: "trainers" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    id: targetId,
    email: "personal@example.test",
  });
});
test("acesso: atualiza e-mail no Auth", async () => {
  const s = setup();
  assert.equal(
    (
      await s.request({
        action: "email",
        id: targetId,
        kind: "trainers",
        email: " NOVO@example.test ",
      })
    ).status,
    200,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0])), {
    id: targetId,
    data: { email: "novo@example.test", email_confirm: true },
  });
});
test("acesso: recusa e-mail inválido", async () => {
  const s = setup();
  assert.equal(
    (
      await s.request({
        action: "email",
        id: targetId,
        kind: "trainers",
        email: "errado",
      })
    ).status,
    400,
  );
  assert.equal(s.calls.length, 0);
});
test("acesso: recusa senha curta", async () => {
  const s = setup();
  assert.equal(
    (
      await s.request({
        action: "password",
        id: targetId,
        kind: "trainers",
        password: "123",
      })
    ).status,
    400,
  );
  assert.equal(s.calls.length, 0);
});
test("acesso: redefine senha somente do alvo autorizado", async () => {
  const s = setup();
  assert.equal(
    (
      await s.request({
        action: "password",
        id: targetId,
        kind: "trainers",
        password: "Test-password-123",
      })
    ).status,
    200,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0])), {
    id: targetId,
    data: { password: "Test-password-123" },
  });
});
test("acesso: recusa tentativa de alterar perfil", async () => {
  const s = setup();
  assert.equal(
    (
      await s.request({
        action: "email",
        id: targetId,
        kind: "trainers",
        email: "novo@example.test",
        perfil: "ADMIN",
      })
    ).status,
    400,
  );
  assert.equal(s.calls.length, 0);
});
test("acesso: recusa origem não permitida", async () => {
  const s = setup();
  assert.equal(
    (
      await s.request(
        { action: "get", id: targetId, kind: "trainers" },
        true,
        "https://outro.example",
      )
    ).status,
    403,
  );
});

test("acesso: permite somente a origem de produção exata, sem liberar outros sites Vercel", async () => {
  const s = setup();
  const allowed = await s.request({ action: "get", id: targetId, kind: "trainers" }, true, "https://steakup.vercel.app");
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://steakup.vercel.app");
  const denied = await s.request({}, true, "https://outro-projeto.vercel.app");
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});

test("acesso: permite origem nativa HTTPS, mantendo exigência de autenticação", async () => {
  const s = setup();
  const allowed = await s.request({ action: "get", id: targetId, kind: "trainers" }, true, "https://localhost");
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://localhost");
  const anonymous = await s.request({}, false, "https://localhost");
  assert.equal(anonymous.status, 401);
  const insecure = await s.request({}, true, "http://localhost");
  assert.equal(insecure.status, 403);
});
