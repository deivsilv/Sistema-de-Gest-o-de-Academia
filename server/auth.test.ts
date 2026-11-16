import type { SessionData } from "../src/academy.ts";
import type { Workout } from "../src/academy.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import type { AddressInfo } from "node:net";
import { createApp, initialStore } from "./app.ts";

test("login, isolamento de dados e permissões são verificados na API", async (t) => {
  const store = initialStore();
  const hash = await bcrypt.hash("Password-only-for-tests-123", 4);
  store.accounts = [
    {
      id: "admin",
      role: "admin",
      personId: 0,
      email: "admin@test.local",
      passwordHash: hash,
      active: true,
    },
    {
      id: "trainer",
      role: "trainer",
      personId: 1,
      email: "trainer@test.local",
      passwordHash: hash,
      active: true,
    },
    {
      id: "student",
      role: "student",
      personId: 1,
      email: "student@test.local",
      passwordHash: hash,
      active: true,
    },
    {
      id: "overdue",
      role: "student",
      personId: 2,
      email: "overdue@test.local",
      passwordHash: hash,
      active: true,
    },
    {
      id: "inactive",
      role: "student",
      personId: 3,
      email: "inactive@test.local",
      passwordHash: hash,
      active: false,
    },
  ];
  const server = createApp(store, () => {}).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  t.after(
    () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    origin = "http://localhost:5173",
  ) {
    return fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Pulso-Request": "1",
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function login(email: string) {
    const r = await request("/auth/login", "POST", {
      email,
      password: "Password-only-for-tests-123",
    });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie")!.split(";")[0];
  }
  await t.test("sem sessão não há acesso", async () => {
    assert.equal((await request("/bootstrap")).status, 401);
    assert.equal((await request("/workouts/workout-1")).status, 401);
  });
  await t.test("senha inválida e conta inativa são recusadas", async () => {
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "admin@test.local",
          password: "wrong",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "inactive@test.local",
          password: "Password-only-for-tests-123",
        })
      ).status,
      401,
    );
  });
  await t.test("não aceita perfil informado no login", async () => {
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "student@test.local",
          password: "Password-only-for-tests-123",
          role: "admin",
        })
      ).status,
      400,
    );
  });
  const student = await login("student@test.local"),
    trainer = await login("trainer@test.local"),
    admin = await login("admin@test.local"),
    overdue = await login("overdue@test.local");
  await t.test(
    "cookie HttpOnly e SameSite e ausência de hash no JSON",
    async () => {
      const r = await request("/auth/login", "POST", {
        email: "admin@test.local",
        password: "Password-only-for-tests-123",
      });
      assert.match(r.headers.get("set-cookie")!, /HttpOnly/);
      assert.match(r.headers.get("set-cookie")!, /SameSite=Strict/);
      const data = (await (
        await request("/bootstrap", "GET", undefined, student)
      ).json()) as SessionData;
      assert.equal(data.role, "student");
      assert.deepEqual(
        data.students.map((s) => s.id),
        [1],
      );
      assert.ok(
        data.payments.every((p) => p.studentId === 1),
      );
      assert.ok(
        data.workouts.every((w) => w.studentId === 1),
      );
      assert.equal(JSON.stringify(data).includes("passwordHash"), false);
    },
  );
  await t.test(
    "aluno não pode criar treinos nem acessar ações administrativas",
    async () => {
      assert.equal(
        (
          await request(
            "/workouts",
            "POST",
            { studentId: 1, title: "X", description: "X" },
            student,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/admin/plans",
            "POST",
            { name: "X", price: 10, months: 1 },
            student,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/admin/students/2",
            "PATCH",
            { active: false },
            student,
          )
        ).status,
        403,
      );
    },
  );
  await t.test("aluno não acessa treino de outro aluno", async () => {
    assert.equal(
      (await request("/workouts/workout-3", "GET", undefined, student)).status,
      404,
    );
  });
  await t.test("inadimplente recebe nenhum conteúdo de treino", async () => {
    assert.equal(
      (await request("/workouts", "GET", undefined, overdue)).status,
      403,
    );
    const data = (await (
      await request("/bootstrap", "GET", undefined, overdue)
    ).json()) as SessionData;
    assert.deepEqual(data.workouts, []);
    assert.equal(data.payments.length, 1);
    assert.equal(data.plans[0].name, "Performance");
  });
  await t.test(
    "personal não recebe pagamentos nem gerencia cadastros",
    async () => {
      const data = (await (
        await request("/bootstrap", "GET", undefined, trainer)
      ).json()) as SessionData;
      assert.deepEqual(data.payments, []);
      assert.equal(
        (
          await request(
            "/admin/plans",
            "POST",
            { name: "X", price: 1, months: 1 },
            trainer,
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "personal não pode forjar autoria nem editar treino de outro profissional",
    async () => {
      assert.equal(
        (
          await request(
            "/workouts",
            "POST",
            { studentId: 1, title: "X", description: "X", trainerId: 999 },
            trainer,
          )
        ).status,
        400,
      );
      store.workouts.push({
        id: "foreign",
        studentId: 1,
        trainerId: 999,
        title: "Outro",
        description: "Outro",
        active: true,
        createdAt: "2026-11-01",
      });
      assert.equal(
        (
          await request(
            "/workouts/foreign",
            "PATCH",
            { title: "Alterado" },
            trainer,
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    "personal pode criar, editar e desativar próprio treino",
    async () => {
      const r = await request(
        "/workouts",
        "POST",
        { studentId: 1, title: "Novo", description: "Descrição" },
        trainer,
      );
      assert.equal(r.status, 201);
      const w = (await r.json()) as Workout;
      assert.equal(w.trainerId, 1);
      assert.equal(
        (
          await request(
            `/workouts/${w.id}`,
            "PATCH",
            { title: "Editado", active: false },
            trainer,
          )
        ).status,
        200,
      );
      assert.equal(store.workouts.find((x) => x.id === w.id)!.active, false);
      assert.equal(
        (await request(`/workouts/${w.id}`, "GET", undefined, student)).status,
        404,
      );
    },
  );
  await t.test(
    "administrador cria conta de aluno e não consulta treinos",
    async () => {
      assert.equal(
        (await request("/workouts", "GET", undefined, admin)).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/admin/students",
            "POST",
            {
              name: "Novo aluno",
              email: "novo@test.local",
              password: "Password-only-for-tests-123",
              plan: "Essencial",
            },
            admin,
          )
        ).status,
        201,
      );
      const cookie = await login("novo@test.local");
      const data = (await (
        await request("/bootstrap", "GET", undefined, cookie)
      ).json()) as SessionData;
      assert.equal(data.role, "student");
      assert.equal(data.person.name, "Novo aluno");
    },
  );
  await t.test("solicitação de outra origem é recusada", async () => {
    assert.equal(
      (
        await request(
          "/auth/logout",
          "POST",
          {},
          student,
          "https://example.com",
        )
      ).status,
      403,
    );
  });
  await t.test("desativação de conta revoga acesso existente", async () => {
    store.accounts.find((a) => a.id === "overdue")!.active = false;
    assert.equal(
      (await request("/bootstrap", "GET", undefined, overdue)).status,
      401,
    );
  });
  await t.test("logout invalida cookie reapresentado", async () => {
    assert.equal(
      (await request("/auth/logout", "POST", {}, student)).status,
      200,
    );
    assert.equal(
      (await request("/bootstrap", "GET", undefined, student)).status,
      401,
    );
  });
  await t.test("cookie adulterado é recusado", async () => {
    assert.equal(
      (
        await request(
          "/bootstrap",
          "GET",
          undefined,
          admin.slice(0, -8) + "tampered",
        )
      ).status,
      401,
    );
  });
});
