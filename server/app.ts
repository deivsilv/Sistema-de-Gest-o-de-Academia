import { randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  dateDaysAgo,
  initialPayments,
  initialWorkouts,
  isPaidUp,
} from "../src/academy.ts";
import type {
  AcademyPerson,
  AcademyPlan,
  Workout,
  Payment,
} from "../src/academy.ts";
export type Role = "admin" | "trainer" | "student";
export type Account = {
  id: string;
  role: Role;
  personId: number | string;
  email: string;
  passwordHash: string;
  active: boolean;
};
export type Store = {
  accounts: Account[];
  students: AcademyPerson[];
  trainers: AcademyPerson[];
  plans: AcademyPlan[];
  workouts: Workout[];
  payments: Payment[];
};
export function initialStore(): Store {
  return {
    accounts: [],
    students: [
      {
        id: 1,
        name: "Ana Beatriz Costa",
        email: "ana@pulso.local",
        active: true,
        plan: "Essencial",
      },
      {
        id: 2,
        name: "Lucas Ferreira",
        email: "lucas@pulso.local",
        active: true,
        plan: "Performance",
      },
      {
        id: 3,
        name: "Mariana Alves",
        email: "mariana@pulso.local",
        active: true,
        plan: "Essencial",
      },
    ],
    trainers: [
      {
        id: 1,
        name: "Rafael Martins",
        email: "rafael@pulso.local",
        active: true,
        plan: "",
        cref: "012345-G/RN",
      },
    ],
    plans: [
      { id: 1, name: "Essencial", price: 99.9, months: 1, active: true },
      { id: 2, name: "Performance", price: 269.9, months: 3, active: true },
    ],
    workouts: initialWorkouts(),
    payments: initialPayments(),
  };
}
const path = resolve(process.env.DATA_FILE || "server/data/academy.json");
export function loadStore(): Store {
  return existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : initialStore();
}
export function saveStore(store: Store) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = path + ".tmp";
  writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  renameSync(temp, path);
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const deny = () => {
  throw new HttpError(403, "Você não tem permissão para esta operação.");
};
const text = (v: unknown, max = 100) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : "";
function checkedFields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((k) => !allowed.includes(k)))
    throw new HttpError(400, "A solicitação contém campos não permitidos.");
}
export function createApp(
  store: Store,
  persist: (s: Store) => void = saveStore,
) {
  const app = express();
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    (!process.env.JWT_SECRET || !process.env.APP_ORIGIN?.startsWith("https://"))
  )
    throw new Error("Configure JWT_SECRET e APP_ORIGIN HTTPS em produção.");
  const secret = process.env.JWT_SECRET || randomBytes(48).toString("hex");
  const sessions = new Map<string, { accountId: string; expires: number }>();
  const origins = production
    ? [process.env.APP_ORIGIN!]
    : ["http://localhost:5173", "http://127.0.0.1:5173"];
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "strict" as const,
    path: "/api",
  };
  const dummyHash = bcrypt.hashSync(randomBytes(24).toString("hex"), 12);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "24kb" }));
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!origins.includes(req.get("origin") || "") ||
        req.get("x-pulso-request") !== "1")
    )
      return next(new HttpError(403, "Origem da solicitação não permitida."));
    next();
  });
  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: { message: "Muitas tentativas. Aguarde 15 minutos." },
    }),
    async (req, res) => {
      checkedFields(req.body, ["email", "password"]);
      const email = text(req.body.email, 254).toLowerCase();
      const password =
        typeof req.body.password === "string" ? req.body.password : "";
      const account = store.accounts.find((a) => a.email === email);
      const valid =
        password.length > 0 &&
        Buffer.byteLength(password) <= 72 &&
        (await bcrypt.compare(password, account?.passwordHash || dummyHash));
      if (!valid || !account || !account.active)
        throw new HttpError(401, "E-mail ou senha inválidos.");
      const person =
        account.role === "student"
          ? store.students.find((p) => p.id === account.personId)
          : account.role === "trainer"
            ? store.trainers.find((p) => p.id === account.personId)
            : null;
      if (account.role !== "admin" && !person?.active)
        throw new HttpError(401, "E-mail ou senha inválidos.");
      for (const [key, s] of sessions)
        if (s.expires <= Date.now()) sessions.delete(key);
      // Discard any previous session from this browser before starting a new one.
      try {
        const old = jwt.verify(req.cookies.pulso_session, secret, {
          algorithms: ["HS256"],
          issuer: "pulso-api",
          audience: "pulso-web",
        }) as jwt.JwtPayload;
        if (old.jti) sessions.delete(old.jti);
      } catch {}
      const jti = randomUUID();
      sessions.set(jti, {
        accountId: account.id,
        expires: Date.now() + 3600000,
      });
      const token = jwt.sign({}, secret, {
        algorithm: "HS256",
        expiresIn: "1h",
        subject: account.id,
        jwtid: jti,
        issuer: "pulso-api",
        audience: "pulso-web",
      });
      res.cookie("pulso_session", token, { ...cookieOptions, maxAge: 3600000 });
      res.json({ ok: true });
    },
  );
  app.use("/api", (req, res, next) => {
    try {
      const claims = jwt.verify(req.cookies.pulso_session, secret, {
        algorithms: ["HS256"],
        issuer: "pulso-api",
        audience: "pulso-web",
      }) as jwt.JwtPayload;
      const session = claims.jti && sessions.get(claims.jti);
      const account = store.accounts.find((a) => a.id === claims.sub);
      if (
        !session ||
        session.expires <= Date.now() ||
        session.accountId !== account?.id ||
        !account?.active
      )
        throw new Error();
      const person =
        account.role === "student"
          ? store.students.find((p) => p.id === account.personId)
          : account.role === "trainer"
            ? store.trainers.find((p) => p.id === account.personId)
            : null;
      if (account.role !== "admin" && !person?.active) throw new Error();
      res.locals.account = account;
      res.locals.jti = claims.jti;
      next();
    } catch {
      res.clearCookie("pulso_session", cookieOptions);
      next(new HttpError(401, "Sua sessão expirou. Entre novamente."));
    }
  });
  function actor(res: Response): Account {
    return res.locals.account;
  }
  function requireRole(...roles: Role[]) {
    return (_req: Request, res: Response, next: NextFunction) => {
      if (!roles.includes(actor(res).role))
        return next(
          new HttpError(403, "Você não tem permissão para esta operação."),
        );
      next();
    };
  }
  function filteredWorkouts(a: Account) {
    if (a.role === "admin") return [];
    if (a.role === "trainer")
      return store.workouts.filter((w) => w.trainerId === a.personId);
    if (!isPaidUp(store.payments, a.personId)) return [];
    return store.workouts.filter((w) => w.studentId === a.personId && w.active);
  }
  app.post("/api/auth/logout", (_req, res) => {
    sessions.delete(res.locals.jti);
    res.clearCookie("pulso_session", cookieOptions);
    res.json({ ok: true });
  });
  app.get("/api/bootstrap", (_req, res) => {
    const a = actor(res);
    const person =
      a.role === "student"
        ? store.students.find((p) => p.id === a.personId)
        : a.role === "trainer"
          ? store.trainers.find((p) => p.id === a.personId)
          : {
              id: 0,
              name: "Administrador",
              email: a.email,
              active: true,
              plan: "",
            };
    res.json({
      role: a.role,
      person,
      students:
        a.role === "admin"
          ? store.students
          : a.role === "trainer"
            ? store.students
                .filter((s) => s.active)
                .map((s) => ({ ...s, email: "", plan: "" }))
            : [person],
      trainers:
        a.role === "admin"
          ? store.trainers
          : a.role === "trainer"
            ? store.trainers.filter((t) => t.id === a.personId)
            : store.trainers.map((t) => ({
                id: t.id,
                name: t.name,
                active: t.active,
                email: "",
                plan: "",
              })),
      plans:
        a.role === "admin"
          ? store.plans
          : a.role === "student"
            ? store.plans.filter((p) => p.name === person?.plan)
            : [],
      payments:
        a.role === "admin"
          ? store.payments
          : a.role === "student"
            ? store.payments.filter((p) => p.studentId === a.personId)
            : [],
      workouts: filteredWorkouts(a),
    });
  });
  app.get("/api/workouts", requireRole("student", "trainer"), (_req, res) => {
    const a = actor(res);
    if (a.role === "student" && !isPaidUp(store.payments, a.personId))
      throw new HttpError(
        403,
        "Acesso aos treinos bloqueado: nenhum pagamento nos últimos 30 dias.",
      );
    res.json(filteredWorkouts(a));
  });
  app.get(
    "/api/workouts/:id",
    requireRole("student", "trainer"),
    (req, res) => {
      const a = actor(res);
      if (a.role === "student" && !isPaidUp(store.payments, a.personId)) deny();
      const w = filteredWorkouts(a).find((w) => w.id === req.params.id);
      if (!w) throw new HttpError(404, "Treino não encontrado.");
      res.json(w);
    },
  );
  app.post("/api/workouts", requireRole("trainer"), (req, res) => {
    checkedFields(req.body, ["studentId", "title", "description"]);
    const studentId = Number(req.body.studentId),
      title = text(req.body.title),
      description = text(req.body.description, 10000);
    if (
      !store.students.some((s) => s.id === studentId && s.active) ||
      !title ||
      !description
    )
      throw new HttpError(400, "Informe aluno ativo, título e descrição.");
    const w: Workout = {
      id: randomUUID(),
      studentId,
      title,
      description,
      trainerId: actor(res).personId,
      active: true,
      createdAt: dateDaysAgo(0),
    };
    store.workouts.unshift(w);
    persist(store);
    res.status(201).json(w);
  });
  app.patch("/api/workouts/:id", requireRole("trainer"), (req, res) => {
    checkedFields(req.body, ["studentId", "title", "description", "active"]);
    const w = store.workouts.find(
      (w) => w.id === req.params.id && w.trainerId === actor(res).personId,
    );
    if (!w) throw new HttpError(404, "Treino não encontrado.");
    const studentId =
      req.body.studentId === undefined
        ? w.studentId
        : Number(req.body.studentId);
    if (req.body.active !== undefined && typeof req.body.active !== "boolean")
      throw new HttpError(400, "Situação inválida.");
    const title = req.body.title === undefined ? w.title : text(req.body.title),
      description =
        req.body.description === undefined
          ? w.description
          : text(req.body.description, 10000);
    if (
      !title ||
      !description ||
      !store.students.some(
        (s) =>
          s.id === studentId &&
          (s.active ||
            (req.body.active === false && Object.keys(req.body).length === 1)),
      )
    )
      throw new HttpError(400, "Dados de treino inválidos ou aluno inativo.");
    Object.assign(w, {
      studentId,
      title,
      description,
      active: req.body.active ?? w.active,
    });
    persist(store);
    res.json(w);
  });
  app.use("/api/admin", requireRole("admin"));
  app.post("/api/admin/plans", (req, res) => upsertPlan(req, res));
  app.patch("/api/admin/plans/:id", (req, res) => upsertPlan(req, res));
  function upsertPlan(req: Request, res: Response) {
    checkedFields(req.body, ["name", "price", "months", "active"]);
    const old = req.params.id
      ? store.plans.find((p) => p.id === Number(req.params.id))
      : undefined;
    if (req.params.id && !old)
      throw new HttpError(404, "Plano não encontrado.");
    const name =
      req.body.name === undefined ? old?.name || "" : text(req.body.name);
    const price = Number(req.body.price ?? old?.price),
      months = Number(req.body.months ?? old?.months),
      active = req.body.active ?? old?.active ?? true;
    if (
      !name ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isInteger(months) ||
      months < 1 ||
      typeof active !== "boolean"
    )
      throw new HttpError(400, "Dados do plano inválidos.");
    if (
      store.plans.some(
        (p) => p.id !== old?.id && p.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new HttpError(409, "Já existe um plano com este nome.");
    const p = { id: old?.id ?? Date.now(), name, price, months, active };
    if (old) {
      if (old.name !== name)
        store.students
          .filter((s) => s.plan === old.name)
          .forEach((s) => (s.plan = name));
      Object.assign(old, p);
    } else store.plans.push(p);
    persist(store);
    res.status(old ? 200 : 201).json(p);
  }
  app.post("/api/admin/:kind", async (req, res) => upsertPerson(req, res));
  app.patch("/api/admin/:kind/:id", async (req, res) => upsertPerson(req, res));
  async function upsertPerson(req: Request, res: Response) {
    if (!["students", "trainers"].includes(String(req.params.kind)))
      throw new HttpError(404, "Recurso não encontrado.");
    checkedFields(req.body, [
      "name",
      "email",
      "password",
      "plan",
      "cref",
      "active",
    ]);
    const role: Role = req.params.kind === "students" ? "student" : "trainer";
    const collection = role === "student" ? store.students : store.trainers;
    const old = req.params.id
      ? collection.find((p) => p.id === Number(req.params.id))
      : undefined;
    if (req.params.id && !old)
      throw new HttpError(404, "Cadastro não encontrado.");
    const name =
      req.body.name === undefined ? old?.name || "" : text(req.body.name);
    const email = (
      req.body.email === undefined
        ? old?.email || ""
        : text(req.body.email, 254)
    ).toLowerCase();
    const plan =
      req.body.plan === undefined
        ? old?.plan || "Sem plano"
        : text(req.body.plan);
    const cref =
      req.body.cref === undefined ? old?.cref || "" : text(req.body.cref);
    const active = req.body.active ?? old?.active ?? true;
    const existingAccount =
      old &&
      store.accounts.find((a) => a.role === role && a.personId === old.id);
    if (
      !name ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof active !== "boolean" ||
      (role === "trainer" && !cref)
    )
      throw new HttpError(
        400,
        "Preencha corretamente nome, e-mail e CREF quando aplicável.",
      );
    if (old && !old.active && req.body.plan !== undefined && plan !== old.plan)
      throw new HttpError(400, "Reative o aluno antes de trocar seu plano.");
    if (
      role === "student" &&
      plan !== "Sem plano" &&
      plan !== old?.plan &&
      !store.plans.some((p) => p.name === plan && p.active)
    )
      throw new HttpError(400, "Selecione um plano ativo.");
    if (
      !old &&
      (typeof req.body.password !== "string" ||
        req.body.password.length < 10 ||
        Buffer.byteLength(req.body.password) > 72)
    )
      throw new HttpError(
        400,
        "A senha inicial deve ter ao menos 10 caracteres e no máximo 72 bytes.",
      );
    if (old && req.body.password !== undefined)
      throw new HttpError(
        400,
        "Alteração de senha não disponível nesta operação.",
      );
    const hash = !old ? await bcrypt.hash(req.body.password, 12) : undefined;
    if (
      store.accounts.some(
        (a) => a.email === email && a.id !== existingAccount?.id,
      )
    )
      throw new HttpError(409, "E-mail já cadastrado.");
    const p: AcademyPerson = {
      id: old?.id ?? Date.now(),
      name,
      email,
      active,
      plan: role === "student" ? plan : "",
      ...(role === "trainer" ? { cref } : {}),
    };
    if (old) {
      Object.assign(old, p);
      if (existingAccount) Object.assign(existingAccount, { email, active });
    } else {
      collection.push(p);
      store.accounts.push({
        id: randomUUID(),
        role,
        personId: p.id,
        email,
        passwordHash: hash!,
        active,
      });
    }
    persist(store);
    res.status(old ? 200 : 201).json(p);
  }
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "Recurso não encontrado.")),
  );
  app.use(
    (
      error: Error & { status?: number },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      res
        .status(
          error.status && error.status >= 400 && error.status < 500
            ? error.status
            : 500,
        )
        .json({
          message:
            error.status && error.status < 500
              ? error.message
              : "Não foi possível concluir a operação.",
        });
    },
  );
  return app;
}
